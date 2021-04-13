export interface SendToRoot {
    sendToRoot(message: any, transfer: Transferable[]): void
    ProxiedWorker: typeof Worker
    ProxiedSharedWorker?: typeof SharedWorker
}

export interface MessageEventTarget {
    addEventListener(name: 'message', handler: (ev: MessageEvent) => any, options?: { once?: boolean }): void
    removeEventListener(name: 'message', handler: (ev: MessageEvent) => any): void
}
export interface MessagePortLike extends MessageEventTarget {
    postMessage(message: any, transfer: Transferable[]): void
    postMessage(message: any): void
    start?: () => void
}
export interface WindowLike extends MessageEventTarget {
    postMessage(message: any, origin: string, tranfer?: Transferable[]): void
    document: any
}
export type MessageTarget = WindowLike | MessagePortLike;

export type Call = (args?: any[], transfer?: Transferable[]) => Promise<any>;
export type Client = Record<string | number, Call>

export type Callback = (...args: any[]) => any | Promise<any>
export type Server = Record<string | number, Callback>

export interface Process {
    port: MessagePort | Worker,
    parent?: number,
    children: Set<number>,
    disableApi?: () => void,
    name?: string
}

export interface ProcessHost {
    start(url: string): number
    fork(port: MessagePort, parent: number): number
    separate(pid: number): void
    exit(pid: number): void
    send(target: number, data: any, transfer: Transferable[]): void
    name(pid: number, name: string): boolean
    find(name: string): number
    wait(name: string): number | Promise<number>
    children(pid: number): Set<number>
    parent(pid: number): number | undefined
}

export interface ProcessAPI {
    // ProcessHost
    start(args: [string]): Promise<number>
    fork(args: [MessagePort], transfer: [MessagePort]): Promise<number>
    separate(): Promise<void>
    exit(): Promise<void>
    getPid(): Promise<number>
    send<T extends Transferable[]>(args: [number, any, T], transfer: T): Promise<void>
    send(args: [number, any]): Promise<void>
    name(args: [string]): Promise<boolean>
    find(args: [string]): Promise<number>
    wait(args: [string]): Promise<number>
    // Display
    show<T extends Transferable[]>(args: [string, any, T], transfer: T): Promise<void>
    show(args: [string, any] | [string]): Promise<void>
    title(args: [string]): Promise<void>
    favicon(args: [string]): Promise<void>
    // History
    go(args: [number]): Promise<void>
    history(): Promise<number>
    onpopstate(args: [MessagePort], transfer: [MessagePort]): Promise<number>
    pushState(args: [any, string, string]): Promise<void>
    replaceState(args: [any, string, string]): Promise<void>
}