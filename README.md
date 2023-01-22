# @jambonz/node-client-ws

A simple Node.js library for building websocket server applications for [jambonz](https://jambonz.org)

# Installing
```
npm install --save @jambonz/node-client-ws
```
Alternatively, to scaffold a full websocket application use the [create-jambonz-ws-app](https://www.npmjs.com/package/create-jambonz-ws-app) utility:
```
npx create-jambonz-ws-app
```

# Usage

## Overview
jambonz can interact with applications using either HTTP webhooks or a websocket connection.  This library provides support for the latter method of operation (see [@jambonz/node-client](https://www.npmjs.com/package/@jambonz/node-client) for the companion  Node.js library to use for building applications using HTTP webhooks).

To use this library, an application must first create an http(s) server.  This library exposes a function, `createEndpoint` that is then invoked to attach a websocket server to that http server.  

Doing so exposes a `makeService` function that can then be called one or more times to create different services corresponding to different request paths (e.g. '/hello-world' would be one service that routes to one application, '/echo' would be a different service that routes to different logic).

Calling `makeService` with a path returns a service client associated with that path.  The client emits a `session:new` event when an incoming call has been received for the specified path, providing the application with a `Session` object which is then used to act on that call.

Sounds a bit involved but it is pretty simple as this sample code should make clear.

```js
/* create an http/s server in your application however you like */
const {createServer} = require('http');
const server = createServer();
server.listen(3000);

/* require the library and call the returned function with your server */
const {createEndpoint} = require('@jambonz/node-client-ws');
const makeService = createEndpoint({server});

/* create a jambonz application listeng for requests with URL path '/hello-world' */
const svc = makeService({path: '/hello-world'});

/* listen for new calls to that service */
svc.on('session:new', (session) => {
  /* the 'session' object has all of the properties of the incoming call */
  console.log({session}, `new incoming call: ${session.call_sid}`);

  /* set up some event handlers for this session */
  session
    .on('close', onClose.bind(null, session))
    .on('error', onError.bind(null, session));

  /* all of the jambonz verbs are available as methods on the session object 
     https://www.jambonz.org/docs/webhooks/overview/
  */
  session
    .pause({length: 1.5})
    .say({text})
    .pause({length: 0.5})
    .hangup()
    .send(); // sends the queued verbs to jambonz
});

const onClose = (session, code, reason) => {
  console.log({session, code, reason}, `session ${session.call_sid} closed`);
};

const onError = (session, err) => {
  console.log({err}, `session ${session.call_sid} received error`);
};
```

### A word on actionHooks

Many jambonz verbs provide asynchronous notification of events; e.g. the `gather` verb sends a notification when a speech transcript is received.  When building the app using webhooks these events are sent as individual HTTP requests, but how is this handled in the case of a websocket application?

Very similarly, is the answer.  You still define actionHooks and eventHooks in the same way, but now instead of a new http request you get a corresponding event emitted by the `session` object.  

```js
session
  .pause({length: 1.5})
  .gather({
    say: {text: 'Please say something and we will echo it back to you.'},
    input: ['speech'],
    actionHook: '/transcript',
    timeout: 15
  })
  .send();

session.on('/transcript', (evt) => {/* respond to transcript here... */});
```

#### replying to actionHooks
When receiving actionHooks or eventHooks from jambonz it is possible to respond with a new set of verbs for jambonz to begin executing.  For instance, based on the transcript returned from a `gather` verb, your app may decide say something back to the user.

When working with webhooks this is accomplished by including a json payload in the 200 OK response of the HTTP webhook.  In this library, we use `session.reply()` instead.  

If you want to response to an actionHook by sending new jambonz verbs to execute, simply do this in your event handler for the actionHook:
```js
session
 .say({text: 'goodbye'})
 .hangup()
 .reply();
```
However, even if you do not want to supply any new verbs, you must reply, e.g.
```js
session.reply();
```

This is necessary so that jambonz does not block on its end of the websocket to see if you have any new verbs before it continues with execution of the current stack of verbs.  

> If you do not reply() to an actionHook or eventHook you may notice a 5-second delay before jambonz continues executing.

#### `send` versus `reply`

There are two main ways for your webhook to send commands to jambonz:
 - `session.send()`
 - `session.reply()`

 The rule of thumb is that when responding to an actionHook or an eventHook (i.e. in a session callback for an event), use `reply()`, otherwise use `send()`.  
 
 > If within an actionHook event handler you first want to reply with a new set of verbs, then later in the same handler want to send yet another set of new verbs use `send()` for the second set.  Only call `reply()` once per event callback.

## API

### Function: createEndpoint

This function is the main export of the library. 

#### createEndpoint({server, port, logger})

- `server` {http.Server}  A pre-created Node.js HTTP/S server.
- `port` {Number} Optional, the port to listen on.  If not provided it is assumed the application will call `listen` on the server object
- `logger` {pinoLogger} Optional, a [pino](https://www.npmjs.com/package/pino) to use for logging.

This function returns a function `makeService` which the application can use to associate different services within the websocket server to different request URL paths.

### Function: makeService

Creates a jambonz service, aka application. 

#### makeService({path})

- `path` {String} Identifies a request URL path for incoming connections which should route to this service.

This function returns an instance of a Client (short for Service Client).

### Class: Client

This class represents a service client, or more generally a jambonz application.

#### Event: 'session:new'

Emitted when a new incoming call for this service has arrived.

- `session` {Session} a single call or session that is being controlled on the jambonz server
- `path` - {String} the request URL path of the incoming HTTP request

### Class: Session

This class represents a unique call in progress on the jambonz server.

#### Event: 'close'

Emitted when the websocket has been closed from the jambonz end.

- `code` {Number} the websocket close code
- `reason` - {String} the reason, if supplied

#### Event: 'error'

Emitted when the underlying websocket connection has an error.

- `err` {Error} the websocket error

#### Event: action hooks

As described above, each webhook that you configure in verbs that you send to jambonz will be emitted as events

- `evt` {Object} event data

#### session.\[verb](data)

All of the [jambonz verbs](https://www.jambonz.org/docs/webhooks/overview/) are available as methods on the `Session` class.  Please review the documentation for each verb on the jambonz.org website.

Calling these methods does not immediately send that verb to jambonz.  The verbs are queued and sent only when `send()` or `reply()` is called.

#### session.send({execImmediate})

- `execImmediate` {Boolean}  When true, this instructs jambonz to begin executing these verbs immediately, flushing any verbs that were already queued or in progress.  When false, the new verbs are appended to the current execution stack within jambonz.  Default: true.

Sends currently queued verbs to jambonz.

#### session.reply()

Sends currently queued verbs to jambonz, associating it as an [ack](https://www.jambonz.org/docs/ws/ack/) response to the last received actionHook.






