## GingerSnap


## Description
Gingersnap is a general purpose library built with the aim of filling the gaps of javascript shortcomings. First-Class support for networking, IO operations and data validation is at the core of this library.

## Installation
To install the package, run `npm install gingersnap`

## Roadmap
- Support request timeout
- Opt out of using an authenticator for a method's request
- Support multiple authenticators, and setting Primary authenticator
- Allow methods to choose authenticator
- Support endpoint polling with subscription methods
- Support offline mode with resume feature once net is back
- Support default response when offline
- Support grouping requests, if one fail cancel all
- Support race requests, the first one that finishes/fails cancel all others and return the response
- Plugin support for services
- Support for NodeJs
- Push message support via subscribers
- Websocket support via subscribers, and methods for sending messages
- Websocket auth support
- Improved documentation
