import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import JSZip = require('jszip');

const LOADFORGE_REPOSITORY = 'BulatovicBalsa/load-forge';
const UPDATE_MANIFEST_URL = `https://github.com/${LOADFORGE_REPOSITORY}/releases/latest/download/update-manifest.json`;

type PlatformKey = 'linux-x64' | 'darwin-x64' | 'darwin-arm64' | 'windows-x64';

type RuntimeManifest = {
    version: string;
    tag: string;
    assets: Partial<Record<PlatformKey, RuntimeAsset>>;
};

type RuntimeAsset = {
    file: string;
    url: string;
    sha256: string;
};

type StoredRuntimeMetadata = {
    version: string;
    tag: string;
    executableRelativePath: string;
    installedAt: string;
};

type UpdateOptions = {
    interactive: boolean;
};

type UpdateResult =
    | { status: 'updated'; version: string }
    | { status: 'already-current'; version: string }
    | { status: 'unsupported-platform' };

let extensionContext: vscode.ExtensionContext | undefined;
let ongoingUpdate: Promise<UpdateResult> | undefined;

type RuntimeSource = 'latest' | 'bundled' | 'custom';

export function initializeRuntimeManager(context: vscode.ExtensionContext) {
    extensionContext = context;
}

function getRuntimeSource(): RuntimeSource {
    const config = vscode.workspace.getConfiguration('loadforge.runtime');
    const value = config.get<string>('source', 'latest');
    if (value === 'bundled' || value === 'custom') {
        return value;
    }
    return 'latest';
}

function getCustomBinaryPath(): string {
    const config = vscode.workspace.getConfiguration('loadforge.runtime');
    return config.get<string>('customBinaryPath', '').trim();
}

export async function getLoadforgeBinaryPath(): Promise<string> {
    const source = getRuntimeSource();

    if (source === 'custom') {
        const customPath = getCustomBinaryPath();
        if (!customPath) {
            throw new Error(
                'loadforge.runtime.source is set to "custom" but loadforge.runtime.customBinaryPath is empty. '
                + 'Please set the path to your LoadForge binary in settings.'
            );
        }
        try {
            await fs.access(customPath);
        } catch {
            throw new Error(
                `Custom LoadForge binary not found at "${customPath}". `
                + 'Check the loadforge.runtime.customBinaryPath setting.'
            );
        }
        return customPath;
    }

    if (source === 'bundled') {
        return getBundledBinaryPath();
    }

    // source === 'latest': prefer downloaded, fall back to bundled
    const downloadedBinaryPath = await getDownloadedBinaryPath();
    if (downloadedBinaryPath) {
        return downloadedBinaryPath;
    }

    return getBundledBinaryPath();
}

export function checkForRuntimeUpdatesOnStartup() {
    if (getRuntimeSource() !== 'latest') {
        return;
    }

    void updateLoadforgeRuntime({ interactive: false }).catch(() => {
        // Startup checks are best-effort; keep the bundled runtime as fallback.
    });
}

export async function updateLoadforgeRuntime(options: UpdateOptions): Promise<UpdateResult> {
    if (ongoingUpdate) {
        return ongoingUpdate;
    }

    ongoingUpdate = performRuntimeUpdate(options).finally(() => {
        ongoingUpdate = undefined;
    });

    return ongoingUpdate;
}

function getBundledBinaryPath(): string {
    const context = requireContext();
    const binaryName = process.platform === 'win32' ? 'loadforge.exe' : 'loadforge';
    return path.join(context.extensionPath, 'bin', binaryName);
}

function getPlatformKey(): PlatformKey | undefined {
    if (process.platform === 'linux' && process.arch === 'x64') {
        return 'linux-x64';
    }

    if (process.platform === 'darwin' && process.arch === 'x64') {
        return 'darwin-x64';
    }

    if (process.platform === 'darwin' && process.arch === 'arm64') {
        return 'darwin-arm64';
    }

    if (process.platform === 'win32' && process.arch === 'x64') {
        return 'windows-x64';
    }

    return undefined;
}

function requireContext(): vscode.ExtensionContext {
    if (!extensionContext) {
        throw new Error('LoadForge runtime manager was not initialized.');
    }

    return extensionContext;
}

function getPlatformRuntimeDirectory(): string {
    const context = requireContext();
    const platformKey = getPlatformKey();
    if (!platformKey) {
        throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`);
    }

    return path.join(context.globalStorageUri.fsPath, 'runtime', platformKey);
}

function getMetadataPath(): string {
    return path.join(getPlatformRuntimeDirectory(), 'current.json');
}

async function readStoredRuntimeMetadata(): Promise<StoredRuntimeMetadata | undefined> {
    try {
        const raw = await fs.readFile(getMetadataPath(), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return undefined;
        }

        const metadata = parsed as Partial<StoredRuntimeMetadata>;
        if (
            typeof metadata.version !== 'string' ||
            typeof metadata.tag !== 'string' ||
            typeof metadata.executableRelativePath !== 'string' ||
            typeof metadata.installedAt !== 'string'
        ) {
            return undefined;
        }

        return metadata as StoredRuntimeMetadata;
    } catch {
        return undefined;
    }
}

async function getDownloadedBinaryPath(): Promise<string | undefined> {
    const metadata = await readStoredRuntimeMetadata();
    if (!metadata) {
        return undefined;
    }

    const binaryPath = path.join(getPlatformRuntimeDirectory(), metadata.executableRelativePath);
    try {
        await fs.access(binaryPath);
        return binaryPath;
    } catch {
        return undefined;
    }
}

async function performRuntimeUpdate(options: UpdateOptions): Promise<UpdateResult> {
    const platformKey = getPlatformKey();
    if (!platformKey) {
        if (options.interactive) {
            void vscode.window.showErrorMessage(`LoadForge runtime updates are not supported on ${process.platform} ${process.arch}.`);
        }
        return { status: 'unsupported-platform' };
    }

    try {
        const manifest = await fetchJson<RuntimeManifest>(UPDATE_MANIFEST_URL);
        const asset = manifest.assets[platformKey];
        if (!asset) {
            throw new Error(`No release asset is available for platform ${platformKey}.`);
        }

        const currentMetadata = await readStoredRuntimeMetadata();
        if (currentMetadata?.version === manifest.version) {
            const binaryPath = await getDownloadedBinaryPath();
            if (binaryPath) {
                if (options.interactive) {
                    void vscode.window.showInformationMessage(`LoadForge runtime is already up to date (${manifest.version}).`);
                }
                return { status: 'already-current', version: manifest.version };
            }
        }

        if (options.interactive) {
            return vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Updating LoadForge runtime to ${manifest.version}`,
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ message: 'Downloading release asset' });
                    const result = await downloadAndInstallRuntime(manifest, asset);
                    progress.report({ message: 'Installed' });
                    void vscode.window.showInformationMessage(`LoadForge runtime updated to ${manifest.version}.`);
                    return result;
                }
            );
        }

        const result = await downloadAndInstallRuntime(manifest, asset);
        void vscode.window.showInformationMessage(`LoadForge runtime updated to ${manifest.version}.`);
        return result;
    } catch (error) {
        if (options.interactive) {
            void vscode.window.showErrorMessage(`Failed to update LoadForge runtime: ${getErrorMessage(error)}`);
        }
        return Promise.reject(error);
    }
}

async function downloadAndInstallRuntime(manifest: RuntimeManifest, asset: RuntimeAsset): Promise<UpdateResult> {
    const runtimeDirectory = getPlatformRuntimeDirectory();
    const versionDirectory = path.join(runtimeDirectory, manifest.version);
    const stagingDirectory = path.join(runtimeDirectory, `${manifest.version}.tmp`);
    const archiveBuffer = await downloadBuffer(asset.url);
    verifySha256(archiveBuffer, asset.sha256);

    await fs.mkdir(runtimeDirectory, { recursive: true });
    await fs.rm(stagingDirectory, { recursive: true, force: true });
    await fs.rm(versionDirectory, { recursive: true, force: true });
    await extractZipToDirectory(archiveBuffer, stagingDirectory);

    const executableRelativePath = getExecutableRelativePath();
    const executableAbsolutePath = path.join(stagingDirectory, executableRelativePath);
    await fs.access(executableAbsolutePath);

    if (process.platform !== 'win32') {
        await fs.chmod(executableAbsolutePath, 0o755);
    }

    await fs.rename(stagingDirectory, versionDirectory);

    const metadata: StoredRuntimeMetadata = {
        version: manifest.version,
        tag: manifest.tag,
        executableRelativePath: path.join(manifest.version, executableRelativePath),
        installedAt: new Date().toISOString()
    };

    await fs.writeFile(getMetadataPath(), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    await removeOldRuntimeVersions(runtimeDirectory, manifest.version);

    return { status: 'updated', version: manifest.version };
}

function getExecutableRelativePath(): string {
    const binaryName = process.platform === 'win32' ? 'loadforge.exe' : 'loadforge';
    return path.join('loadforge', binaryName);
}

async function removeOldRuntimeVersions(runtimeDirectory: string, currentVersion: string) {
    const entries = await fs.readdir(runtimeDirectory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
        if (!entry.isDirectory()) {
            return;
        }

        if (entry.name === currentVersion) {
            return;
        }

        await fs.rm(path.join(runtimeDirectory, entry.name), { recursive: true, force: true });
    }));
}

async function extractZipToDirectory(buffer: Buffer, destination: string) {
    const zip = await JSZip.loadAsync(buffer);
    await fs.mkdir(destination, { recursive: true });

    await Promise.all(Object.values(zip.files).map(async (entry) => {
        const safeRelativePath = toSafeRelativePath(entry.name);
        if (!safeRelativePath) {
            return;
        }

        const destinationPath = path.join(destination, safeRelativePath);
        if (entry.dir) {
            await fs.mkdir(destinationPath, { recursive: true });
            return;
        }

        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        const content = await entry.async('nodebuffer');
        await fs.writeFile(destinationPath, content);
    }));
}

function toSafeRelativePath(entryName: string): string | undefined {
    const normalized = path.posix.normalize(entryName);
    if (normalized.startsWith('/') || normalized.startsWith('../') || normalized === '..') {
        return undefined;
    }

    return normalized.split('/').join(path.sep);
}

function verifySha256(buffer: Buffer, expectedSha256: string) {
    const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualSha256 !== expectedSha256) {
        throw new Error('Downloaded runtime checksum did not match the release manifest.');
    }
}

async function fetchJson<T>(url: string): Promise<T> {
    const buffer = await downloadBuffer(url);
    return JSON.parse(buffer.toString('utf8')) as T;
}

function downloadBuffer(url: string, remainingRedirects: number = 10): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                'User-Agent': 'vscode-loadforge'
            }
        }, (response) => {
            const statusCode = response.statusCode ?? 0;
            if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
                response.resume();
                if (remainingRedirects <= 0) {
                    reject(new Error('Too many redirects.'));
                    return;
                }
                resolve(downloadBuffer(response.headers.location, remainingRedirects - 1));
                return;
            }

            if (statusCode < 200 || statusCode >= 300) {
                response.resume();
                reject(new Error(`Request failed with status ${statusCode}.`));
                return;
            }

            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer | string) => {
                chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            });
            response.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            response.on('error', reject);
        });

        request.on('error', reject);
    });
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
