import { makeServer } from "./ipc";
import { Process, ProcessHost } from "./types";

/**
 * Create a process host.
 */
export function processHost(
    getPort: (url: string) => MessagePort | Worker,
    hostApiCallback: (pid: number) => Record<string, any>
): ProcessHost {
    let idCounter = 0;

    /**
     * Returns a new process ID
     */
    const getPID = (): number => {
        while (table.has(++idCounter));
        return idCounter;
    };

    // ================== Lifetimes ======================

    /**
     * A struct map of everything there is to know about each process.
     */
    const table = new Map<number, Process>();

    /**
     * Construct an instance of the system API that listens on the port of the
     * process.
     */
    const buildAPI = (pid: number): () => void => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        return makeServer(proc.port, Object.assign(
            {
                // Lifetime
                start,
                fork: (port: MessagePort) => fork(port, pid),
                separate: () => separate(pid),
                exit: () => exit(pid),
                // Communicate
                getPid: () => pid,
                send: (pid: number, data: any, transfer: Transferable[]) => send(pid, data, transfer),
                // Manage visibility
                name: (n: string) => name(pid, n),
                // Query processes
                find: (name: string) => find(name),
                wait: (name: string) => wait(name)
            },
            hostApiCallback(pid)
        ));
    };

    /**
     * Starts a new process from URL
     */
    const start = (url: string): number => {
        const pid = getPID();
        const port = getPort(url);
        const process: Process = {
            port, children: new Set()
        };
        table.set(pid, process);
        process.disableApi = buildAPI(pid);
        return pid;
    };

    /**
     * Accept the port as a child process of the parent.
     */
    const fork = (port: MessagePort, parent: number): number => {
        const parentObj = table.get(parent);
        if (!parentObj) throw new Error('Process not found');
        const pid = getPID();
        const process: Process = {
            port, parent, children: new Set()
        };
        table.set(pid, process);
        process.disableApi = buildAPI(pid);
        parentObj.children.add(pid);
        return pid;
    };

    /**
     * Separate the process from its parent.
     */
    const separate = (pid: number): void => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        if (!proc.parent) throw new Error('Process has no parent');
        const parent = table.get(proc.parent);
        if (!parent) throw new Error('Process has no parent');
        delete proc.parent;
        parent.children.delete(pid);
    };

    /**
     * Remove this process from the table, remove it from its parent's list of
     * children and close its channel. Do the same for all of its children.
     */
    const exit = (pid: number) => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        for (const child of proc.children) {
            exit(child);
        }
        if (proc.parent) {
            const parent = table.get(proc.parent);
            if (parent) parent.children.delete(pid);
        }
        proc.disableApi?.();
        table.delete(pid);
        if ('close' in proc.port) proc.port.close();
        if ('terminate' in proc.port) proc.port.terminate();
    };

    // ================ Messaging =====================

    /**
     * Send a message to the process.
     */
    const send = (pid: number, data: any, transfer: Transferable[]) => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        proc.port.postMessage(data, transfer);
    };

    // =================== Visibility ========================

    const names = new Map<string, number>();
    const nameCallbacks = new Map<string, ((pid: number) => void)[]>();

    /**
     * Set the name for the given process
     */
    const name = (pid: number, name: string): boolean => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        if (names.has(name)) return false;
        if (proc.name) names.delete(proc.name);
        if (name) {
            names.set(name, pid);
            const callbacks = nameCallbacks.get(name);
            if (callbacks) for (const cb of callbacks) cb(pid);
        }
        return true;
    };

    /**
     * Find the process identified by a given name, or -1 if there isn't one.
     */
    const find = (name: string): number => {
        return names.get(name) ?? -1;
    };

    /**
     * Find the process by this name. If there isn't one, return a promise that
     * resolves when it appears.
     */
    const wait = (name: string): number | Promise<number> => {
        return names.get(name) ?? new Promise(resolve => {
            const previous = nameCallbacks.get(name);
            if (previous instanceof Array) previous.push(resolve);
            else nameCallbacks.set(name, [resolve]);
        });
    };

    // =================== Tree navigation =================

    /**
     * Return the children of a given process
     */
    const children = (pid: number): Set<number> => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        return proc.children;
    }

    /**
     * Get the parent of the given process if it exists.
     */
    const parent = (pid: number): number | undefined => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        return proc.parent;
    }

    return {
        // ==== API ====
        // Lifetimes
        start, fork, separate, exit,
        // Communicate
        send,
        // Visibility
        name, find, wait,
        // ==== Management ====
        // Tree
        children, parent
    };
}