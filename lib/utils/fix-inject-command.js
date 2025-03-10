const assert = require('assert');
const injectSchema = require('../../data/inject-commands.json');
const debug = require('debug')('jambonz:node-client-ws');


const fixInjectCommand = (command, opts) => {
    switch (command) {
        case 'transcribe:status':
            if (typeof(opts) === 'string'){
                opts = {'transcribe_status': opts}
            }
            break;
        case 'listen:status':
            if (typeof(opts) === 'string'){
                opts = {'listen_status': opts}
            }
            break;
        case 'call:status':
            if (typeof(opts) === 'string'){
                opts = {'call_status': opts}
            }
            break;
        case 'mute:status':
            if (typeof(opts) === 'string'){
                opts = {'mute_status': opts}
            }
            break;
        case 'conf:mute-status':
            if (typeof(opts) === 'string'){
                opts = {'conf_mute_status': opts}
            }
            break;
        case 'conf:hold-status':
            if (typeof(opts) === 'string'){
                opts = {'conf_hold_status': opts}
            }
            break;
        default:
            break;
    }
}


module.exports = {
    fixInjectCommand,
};
