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
                start: (child: string | MessagePort) => start(child, pid),
                exit: (process = pid) => {
                    if (!isInSubtree(process, pid)) throw new Error('Not descendant');
                    exit(pid)
                },
                // Tree
                children: (process = pid) => {
                    if (!isInSubtree(process, pid)) throw new Error('Not descendant');
                    return [...children(process)]
                },
                parent: (process = pid) => {
                    if (!isInSubtree(process, pid)) throw new Error('Not descendant');
                    return parent(process);
                },
                reparent: (process: number, target = pid) => {
                    if (!isInSubtree(process, pid)) throw new Error('Not descendant');
                    if (isInSubtree(target, process)) throw new Error('Topology violation');
                    return reparent(process, target);
                },
                // Communicate
                getPid: () => pid,
                send: (target: number, data: any, transfer: Transferable[]) => 
                    send(target, [pid, data], transfer),
                // Manage visibility
                name: (options: string[]) => name(pid, options),
                // Query processes
                find: (options: string[]) => find(options),
                wait: (name: string) => wait(name)
            },
            hostApiCallback(pid)
        ));
    };

    /**
     * If port or worker, accept it as a child process of the parent.
     * If string, start a new worker as a child process.
     */
    const start = (child: MessagePort | Worker | string, parent?: number): number => {
        const parentObj = parent ? table.get(parent) : undefined;
        if (parent && !parentObj) throw new Error('Process not found');
        if (typeof child == 'string') child = getPort(child);
        const pid = getPID();
        const process: Process = {
            port: child, parent, children: new Set()
        };
        table.set(pid, process);
        process.disableApi = buildAPI(pid);
        if (parentObj) parentObj.children.add(pid);
        return pid;
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
    const name = (pid: number, options: string[]): string | false => {
        const proc = table.get(pid);
        if (!proc) throw new Error('Process not found');
        if (proc.name) {
            names.delete(proc.name);
            proc.name = undefined;
        }
        for (const name of options) {
            if (!names.has(name)) {
                names.set(name, pid);
                proc.name = name;
                const callbacks = nameCallbacks.get(name);
                if (callbacks) for (const cb of callbacks) cb(pid);
                return name;
            }
        }
        return false;
    };

    /**
     * Find the process identified by a given name, or -1 if there isn't one.
     */
    const find = (options: string[]): [string, number] | false => {
        if (!options.length) return false;
        const result = names.get(options[0])
        if (result !== undefined) return [options[0], result];
        // If JS will ever get TCO this will be fast.
        return find(options.slice(1));
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

    // =================== Tree =================

    /**
     * Return the children of a given process
     */
    const children = (pid?: number | undefined): Set<number> => {
        // If PID is undefined, get all top-level processes
        if (pid === undefined) return new Set(
            [...table]
            .filter(([_, proc]) => proc.parent === undefined)
            .map(([id]) => id)
        );
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

    /**
     * Decides whether pid is a descendant of parent
     */
    const isInSubtree = (pid: number | undefined, root: number): boolean => {
        while (typeof pid == 'number') {
            const proc = table.get(pid);
            if (!proc) throw new Error('Process not found');
            if (pid == root) return true;
            pid = proc.parent;
        }
        return false;
    }

    const reparent = (pid: number, parent?: number): void => {
        const proc = table.get(pid);
        if (!proc || parent !== undefined && !table.has(parent)) {
            throw new Error('Process not found');
        }
        if (proc.parent) {
            const old = table.get(proc.parent);
            if (!old) throw new Error('BUG');
            old.children.delete(pid);
            proc.parent = undefined;
        }
        if (parent) {
            const target = table.get(parent);
            target?.children.add(pid);
            proc.parent = parent;
        }
    }

    return {
        // ==== API ====
        // Lifetimes
        start, exit,
        // Tree
        reparent, children, parent,
        // Communicate
        send,
        // Visibility
        name, find, wait,
        // ======= Manage ===========
        isInSubtree
    };
}