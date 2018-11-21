
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// CLASSES

	class HTTP_MSG {
		get status () { return this._status; }
		get temp   () { return this._temp;   }
		get help   () { return this._help;   }
		constructor(status = 200, temp = '', help = false) {
			this._status = status||200;
			this._temp	 = temp||'Unknown Issue?';
			this._help 	 = Boolean(!!help);
		}
		valueOf () { return {
			status: this.status,
			temp: 	this.temp,
			help: 	this.help,
		}; }
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Constants

	const 	UER = { message: 'unknown', stack: 'Error: unknown\n' },
			MSG = {
				REQUEST: 	new HTTP_MSG( 200, 'Successful'),
				HELP: 		new HTTP_MSG( 200, 'General Help', true),
				RESTORED: 	new HTTP_MSG( 200, 'Restored %s\'s Session.'),
				ENDED: 		new HTTP_MSG( 200, 'Ended %s\'s Session.'),
				EXPIRED: 	new HTTP_MSG( 200, '%s\'s Session Expired.'),
				LOADED: 	new HTTP_MSG( 200, 'Loaded %s\'s Profile.'),
				UPDATED: 	new HTTP_MSG( 200, 'Updated %s\'s Profile.'),
				PROFILE: 	new HTTP_MSG( 200, '%s\'s Profile.'),
				ADDED: 		new HTTP_MSG( 201, 'Added %s\'s Profile.'),
				VALID: 		new HTTP_MSG( 202, 'Request-Token is valid.'),

				BAD_REQ: 	new HTTP_MSG( 400, 'Bad Request', true),
				ERROR: 		new HTTP_MSG( 400, 'Sorry, but an error has occurred.'),
				INVALID: 	new HTTP_MSG( 401, 'Sorry, but this session is invalid.'),
				TOKEN: 		new HTTP_MSG( 401, 'The Token does NOT match Session User\'s Token.'),
				LOGIN: 		new HTTP_MSG( 401, 'This session is not Logged in.'),
				EXISTS: 	new HTTP_MSG( 404, '%s does NOT exist.'),
				NO_GET: 	new HTTP_MSG( 405, 'HTTP-GET is NOT allowed.', true),
				NO_POST: 	new HTTP_MSG( 405, 'HTTP-POST is NOT allowed.', true),
				NO_PUT: 	new HTTP_MSG( 405, 'HTTP-PUT is NOT allowed.', true),
				NO_DELETE: 	new HTTP_MSG( 405, 'HTTP-DELETE is NOT allowed.', true),
				RATELIMIT: 	new HTTP_MSG( 429, 'Oh, come on! Rate-limit exceeded, dude...'),
			},
			PRM = {
				GET: 	'query',
				POST: 	'body',
				PUT: 	'body',
				DELETE: 'query',
			};

/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = { UER, MSG, PRM };

/////////////////////////////////////////////////////////////////////////////////////////////
