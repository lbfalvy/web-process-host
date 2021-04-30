export type Contravariant<T> = 
  (T extends any ? (x: T) => any : never) extends 
  (x: infer R) => any ? R : never

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
    close?: () => void
}
export interface WindowLike extends MessageEventTarget {
    postMessage(message: any, origin: string, tranfer?: Transferable[]): void
    document: any
}
export type MessageTarget = WindowLike | MessagePortLike;

export type Call = (args?: any[], transfer?: Transferable[]) => Promise<any>;
export type Client = Record<string | number, Call>

export type Property<Name extends string, T> =
    & Record<`get${Name}`, () => T>
    & Record<`track${Name}`, (port: MessagePort) => void>
    & Record<Name, T>
export type ClientProperty<Name extends string, T> =
    & Record<`get${Name}`, () => Promise<T>>
    & Record<`track${Name}`, (args: [MessagePort], transfer: [MessagePort]) => Promise<void>>
    & { readonly [n in Name]: T }

export interface Process {
    port: MessagePort | Worker,
    parent?: number,
    children: Set<number>,
    disableApi?: () => void,
    name?: string
}

export interface ProcessHost {
    start(child: string | MessagePort, parent?: number): number
    exit(pid: number): void
    send(target: number, data: any, transfer?: Transferable[]): void
    name(pid: number, options: string[]): string | false
    find(options: string[]): [string, number] | false
    wait(name: string): number | Promise<number>
    reparent(pid: number, parent?: number): void
    children(pid?: number | undefined): Set<number>
    parent(pid: number): number | undefined
    isInSubtree(pid: number, root: number): boolean
}

export interface ProcessAPI extends 
    ClientProperty<'Title', string>,
    ClientProperty<'Favicon', string> {
    // ProcessHost
    start(args: [string]): Promise<number>
    start(args: [MessagePort], transfer: [MessagePort]): Promise<number>
    exit(): Promise<void>
    getPid(): Promise<number>
    send(args: [number, any], transfer?: Transferable[]): Promise<void>
    name(args: [string[]]): Promise<string | false>
    find(args: [string[]]): Promise<[string, number] | false>
    wait(args: [string]): Promise<number>
    // Display
    show(args: [string, any], transfer: Transferable[]): Promise<void>
    show(args: [string, any] | [string]): Promise<void>
    setTitle(args: [string]): Promise<void>
    setFavicon(args: [string]): Promise<void>
    // History
    go(args: [number]): Promise<void>
    history(): Promise<number>
    onpopstate(args: [MessagePort], transfer: [MessagePort]): Promise<number>
    pushState(args: [any, string, string]): Promise<void>
    replaceState(args: [any, string, string]): Promise<void>
}