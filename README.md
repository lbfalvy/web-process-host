### Means of communication

Local peers communicate through `MessageChannel`s. Since MessageChannel has no
means to signal when it is closed, if your program wishes to react to the
closing of a MessageChannel it should listen to the message
`{ channel: "close" }`. All peers are required to send this message whenever
they close a connection.

# Workers

A worker can post a MessagePort out and use it with the API client. If you want
a worker to be able to talk to the root window, forward all their outbound
messages upwards. An incoming message will always represent a non-system
caller, eg. the parent process.

# Frames

A window or iframe should receive a MessagePort from its opener. Whether this
port is for communication with the opening process or itself an independent
process is up to the components involved.

### API functions

Through a root MessagePort the following functions are available. Note that a
root MessagePort identifies a process and plain subchannels have the same
identity as the original. If you do not entirely trust the code you're running
or you expect it might want to name itself, create a new process with fork().

- Lifetime
  - start(url): pid
    The parent can now message the child using the pid. If they want secure
    communication, the parent can include some kind of token in the URL hash.
  - fork(MessagePort): void
    Treat the MessagePort as a new process that has its own pid. The fork will
    be automatically terminated when the parent terminates unless separate() is
    called
  - separate(): void
    Split from the parent process, such that this process isn't terminated
    with the parent.
  - exit(): void
    Remove this process from the process table, as well as all of its children,
    and close their ports.
- Communicate
  - getpid(): pid
    Get our own PID. This serves to implement replies, although you should
    probably post a MessagePort instead.
  - send(pid, message, transfer): void
    Post a message to the given process. For workers this posts the data to the
    worker, firing `WorkerGlobalScope`'s `message` event. For everything
    represented by a channel, it posts to the channel.
- Manage visibility
  - name(name?): success
    If the given name is available, assigns this process to it so that other
    processes can find it. If `name` is undefined, removes the process' name.
- Query processes
  - find(name): pid | -1
    Find the process with the given name. If none is found, -1 is returned.
  - wait(name): pid
    Wait for a process to take the given name, then return its pid.
- Set the current view
  - show(url, message, transfer): void
    Show the given URL in the main window and post `message` and `transfer` to
    it as ssoon as the contents of the iframe load. Do not use this unless you
    know that no other process is displaying anything, because it silently
    overrides the current location.
