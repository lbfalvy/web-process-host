# Process Host

This is a library for low-trust multiprocessing on the frontend, but it also
comes with a standard interface for services to access the frontend. Of course
you are free to implement it partially or limit access, but following the
standard will help encourage the making of general purpose services and
ultimately lead towards a truly modular web. Below is a documentation for the
API, for an example of how to implement it, see the code.

## Means of communication

Local peers communicate through `MessageChannel`s. Since MessageChannel has no
means to signal when it is closed, if your program wishes to react to the
closing of a MessageChannel it should listen to the message
`{ channel: "close" }`. All peers are required to send this message whenever
they close a connection.

### Workers

A worker can post a MessagePort out and use it with the API client. If you want
a worker to be able to talk to the root window, forward all their outbound
messages upwards. An incoming message will always represent a non-system
caller, eg. the parent process.

### Frames

A window or iframe should receive a MessagePort from its opener. Whether this
port is for communication with the opening process or itself an independent
process is up to the components involved.

### Properties

A property with respect to a server is defined as any string Name for which

- getName(): any
- trackName(MessagePort): void  
  Messages travelling through MessagePort can have a "value" and an "error"
  property or possibly `{ channel: "close" }`.
- Name() is not defined

They are used for representing changing values, this library provides helpers
for defining and controlling them, but you can rely on the methods provided to
craft your own implementation. It is often beneficial to use the methods
directly when you want to react to a property change for example.

## API functions

Through a root MessagePort the following functions are available. Note that a
root MessagePort identifies a process and plain subchannels have the same
identity as the original. If you do not entirely trust the code you're running
or you expect it might want to name itself, create a new process with start().

- Lifetime
  - start(MessagePort|url): pid
    If the arguemt is an URL, start a new worker with it. If it's a
    MessagePort, register it as a new process.
  - exit(pid=self): void
    Remove the process from the process table, as well as all of its children,
    and close their ports. If they have a terminate() method, call it too.
    Only works on self and descendants
- Tree
  - reparent(pid, parent): void
    Change the parent of a given process. Only works on descendants.
  - children(pid=self): pid[]
    Returns the PIDs of all children. Only works on self and descendants.
  - parent(pid=self): pid
    Returns the PID of the parent process. Only works on self and descendants.
- Communicate
  - getpid(): pid
    Get our own PID. This serves to implement replies, although you should
    probably post a MessagePort instead.
  - send(pid, message, transfer): void
    Post a message to the given process. For workers this posts the tuple
    `[sender, data]` to the worker, firing `WorkerGlobalScope`'s `message`
    event. For everything represented by a channel, it posts to the channel.
- Manage visibility
  - name(options[]): final|false
    If any of the given options is available, assigns this process to the first
    so that other processes can find it.
- Query processes
  - find(names[]): [name, pid] | false
    Find the process with the given name. If none is found, false is returned.
  - wait(name): pid
    Wait for a process to take the given name, then return its pid.
- Set the current view
  - show(url, message, transfer): void
    Show the given URL in the main window and post `message` and `transfer` to
    it as ssoon as the contents of the iframe load. Do not use this unless you
    know that no other process is displaying anything, because it silently
    overrides the current location.
  - Property Title: string
    The document title
  - setTitle(string): void
    Update document title
  - Property Favicon: string
    The document icon
  - setFavicon(string): void
    Update document icon
- Interact with the history API
  - go(offset): void
    Go back or forward in history
  - history(): length
    Detect the length of the history stack
  - onPopState(port): void
    Send any popstate events through the message port. You can close the
    channel by sending anything through it.
  - pushState(data, title, url): void
    Push on the history stack
  - replaceState(data, title, url): void
    Replace the current history entry with a new one
