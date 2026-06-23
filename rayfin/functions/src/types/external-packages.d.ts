/**
 * Ambient type declarations for external npm packages used by the
 * AIDIP server-side functions.
 *
 * These shims let the functions subproject type-check without
 * requiring the actual packages to be installed in `node_modules`.
 * When the packages are installed (via `npm install` inside
 * `rayfin/functions/`), the real package types take precedence and
 * these shims become no-ops.
 *
 * The API surfaces declared here mirror the official SDKs:
 *   - @azure/openai        ^2.0.0
 *   - @azure/identity      ^4.0.0
 *   - @azure/storage-blob  ^12.0.0
 *   - pptxgenjs            ^3.12.0
 *   - puppeteer-core       ^23.0.0
 *   - canvas               ^3.0.0
 *   - jsonwebtoken         ^9.0.0  (also provided by @types/jsonwebtoken)
 */

// ============================================================================
// @azure/openai
// ============================================================================
declare module '@azure/openai' {
  export class AzureKeyCredential {
    constructor(key: string);
    readonly key: string;
  }

  export interface ChatRequestMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
  }

  export interface ChatChoice {
    index: number;
    message: { role: string; content: string };
    finishReason: string;
  }

  export interface ChatCompletionsUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }

  export interface ChatCompletions {
    id: string;
    choices: ChatChoice[];
    usage: ChatCompletionsUsage;
    created: number;
    model: string;
  }

  export interface ChatCompletionsOptions {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    responseFormat?: { type: 'text' | 'json_object' };
    stop?: string | string[];
  }

  export class OpenAIClient {
    constructor(endpoint: string, credential: AzureKeyCredential);
    getChatCompletions(
      deploymentName: string,
      messages: ChatRequestMessage[],
      options?: ChatCompletionsOptions,
    ): Promise<ChatCompletions>;
    /** Alias used by the @azure/openai v2 SDK. */
    chatCompletions(
      deploymentName: string,
      messages: ChatRequestMessage[],
      options?: ChatCompletionsOptions,
    ): Promise<ChatCompletions>;
  }
}

// ============================================================================
// @azure/identity
// ============================================================================
declare module '@azure/identity' {
  export interface AccessToken {
    token: string;
    expiresOnTimestamp: number;
  }

  export interface TokenCredential {
    getToken(scopes: string | string[], options?: unknown): Promise<AccessToken | null>;
  }

  export interface ClientSecretCredentialOptions {
    authorityHost?: string;
  }

  export class ClientSecretCredential {
    constructor(
      tenantId: string,
      clientId: string,
      clientSecret: string,
      options?: ClientSecretCredentialOptions,
    );
    getToken(scopes: string | string[], options?: unknown): Promise<AccessToken | null>;
  }

  export class DefaultAzureCredential {
    getToken(scopes: string | string[], options?: unknown): Promise<AccessToken | null>;
  }
}

// ============================================================================
// @azure/storage-blob
// ============================================================================
declare module '@azure/storage-blob' {
  export class StorageSharedKeyCredential {
    constructor(accountName: string, accountKey: string);
  }

  export class BlobSASPermissions {
    static parse(permissions: string): BlobSASPermissions;
    read: boolean;
    write: boolean;
    delete: boolean;
    list: boolean;
    add: boolean;
    create: boolean;
  }

  export interface SASProtocol {
    readonly protocols: 'https' | 'https,http';
  }

  export function generateBlobSASQueryParameters(
    options: {
      containerName: string;
      blobName: string;
      permissions: BlobSASPermissions;
      startsOn?: Date;
      expiresOn: Date;
    },
    credential: StorageSharedKeyCredential,
  ): { url: string };

  export interface BlockBlobUploadHeaders {
    blobType?: string;
    etag?: string;
  }

  export interface BlockBlobClient {
    uploadData(
      data: Buffer | Uint8Array,
      options?: { blobHTTPHeaders?: { blobContentType?: string } },
    ): Promise<{ response: BlockBlobUploadHeaders; etag: string }>;
    download(): Promise<{ readableStreamBody?: NodeJS.ReadableStream; contentLength?: number }>;
    delete(): Promise<void>;
    url: string;
  }

  export interface ContainerClient {
    getBlockBlobClient(blobName: string): BlockBlobClient;
    createIfNotExists(): Promise<{ succeeded: boolean }>;
  }

  export class BlobServiceClient {
    constructor(connectionString: string);
    static fromConnectionString(connectionString: string): BlobServiceClient;
    getContainerClient(containerName: string): ContainerClient;
  }
}

// ============================================================================
// pptxgenjs
// ============================================================================
declare module 'pptxgenjs' {
  export interface PptxGenJsSlide {
    addText(text: string, options?: Record<string, unknown>): void;
    addImage(image: string | { data: string; x: number; y: number; w: number; h: number }): void;
    addShape(shape: string, options?: Record<string, unknown>): void;
    addTable(rows: unknown, options?: Record<string, unknown>): void;
    background: (color: string) => void;
  }

  export interface PptxGenJsOptions {
    layout?: 'LAYOUT_16x9' | 'LAYOUT_4x3' | string;
    title?: string;
    author?: string;
  }

  export type PptxOutputType = 'nodebuffer' | 'arraybuffer' | 'blob' | 'base64' | 'datauri';

  export default class PptxGenJS {
    constructor(options?: PptxGenJsOptions);
    layout: string;
    defineLayout(options: { name: string; width: number; height: number }): void;
    addSlide(): PptxGenJsSlide;
    write(options: { outputType: PptxOutputType }): Promise<Buffer | string>;
    writeFile(options?: { fileName?: string }): Promise<string>;
  }
}

// ============================================================================
// puppeteer-core
// ============================================================================
declare module 'puppeteer-core' {
  export interface Page {
    setContent(html: string, options?: { waitUntil?: string }): Promise<void>;
    pdf(options?: {
      format?: string;
      printBackground?: boolean;
      margin?: { top?: string; bottom?: string; left?: string; right?: string };
      landscape?: boolean;
    }): Promise<Buffer>;
    screenshot(options?: { fullPage?: boolean; type?: 'png' | 'jpeg' }): Promise<Buffer>;
    close(): Promise<void>;
  }

  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface LaunchOptions {
    executablePath?: string;
    headless?: boolean;
    args?: string[];
    timeout?: number;
  }

  export function launch(options?: LaunchOptions): Promise<Browser>;
  const _default: { launch: typeof launch };
  export default _default;
}

// ============================================================================
// canvas
// ============================================================================
declare module 'canvas' {
  export interface CanvasRenderingContext2D {
    fillStyle: string | CanvasGradient;
    strokeStyle: string | CanvasGradient;
    lineWidth: number;
    font: string;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    stroke(): void;
    arc(x: number, y: number, r: number, start: number, end: number): void;
    fill(): void;
  }

  export interface Canvas {
    width: number;
    height: number;
    getContext(type: '2d'): CanvasRenderingContext2D;
    toBuffer(mime?: 'image/png' | 'image/jpeg'): Buffer;
  }

  export function createCanvas(width: number, height: number): Canvas;
}

// ============================================================================
// jsonwebtoken — re-exported in case @types/jsonwebtoken isn't installed
// locally in the functions subproject.
// ============================================================================
declare module 'jsonwebtoken' {
  export interface JwtPayload {
    [key: string]: unknown;
  }

  export interface SignOptions {
    algorithm?: string;
    expiresIn?: number | string;
    notBefore?: number | string;
    issuer?: string;
    subject?: string;
    audience?: string;
  }

  export interface VerifyOptions {
    algorithms?: string[];
    issuer?: string;
    subject?: string;
    audience?: string;
    complete?: boolean;
    clockTimestamp?: number;
    maxAge?: number | string;
  }

  export function sign(
    payload: string | object | Buffer,
    secret: string | Buffer,
    options?: SignOptions,
  ): string;

  export function verify(
    token: string,
    secret: string | Buffer,
    options?: VerifyOptions,
  ): string | JwtPayload;

  export function decode(token: string): JwtPayload | string | null;
}
