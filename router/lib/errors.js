
/////////////////////////////////////////////////////////////////////////////////////////////
// Constants
	const UER = { message: 'unknown', stack: 'Error: unknown\n' };
	const MSG = {
		REQUEST: 	{ status: 200, help: false, temp: 'Successful' },
		HELP: 		{ status: 200, help:  true, temp: 'General Help' },
		BAD_REQ: 	{ status: 400, help:  true, temp: 'Bad Request' },
		NO_GET: 	{ status: 405, help:  true, temp: 'HTTP-GET is NOT allowed.' },
		NO_POST: 	{ status: 405, help:  true, temp: 'HTTP-POST is NOT allowed.' },
		NO_PUT: 	{ status: 405, help:  true, temp: 'HTTP-PUT is NOT allowed.' },
		NO_DELETE: 	{ status: 405, help:  true, temp: 'HTTP-DELETE is NOT allowed.' },
		ERROR: 		{ status: 400, help: false, temp: 'Sorry, but an error has occurred.' },
		INVALID: 	{ status: 401, help: false, temp: 'Sorry, but this session is invalid.' },
		TOKEN: 		{ status: 401, help: false, temp: 'The Token does NOT match Session User\'s Token.' },
		EXISTS: 	{ status: 404, help: false, temp: '%s does NOT exist.' },
		RESTORED: 	{ status: 200, help: false, temp: 'Restored %s\'s Session.' },
		ENDED: 		{ status: 200, help: false, temp: 'Ended %s\'s Session.' },
		LOGIN: 		{ status: 401, help: false, temp: 'This session is not Logged in.' },
		ADDED: 		{ status: 200, help: false, temp: 'Added %s\'s Profile.' },
		LOADED: 	{ status: 200, help: false, temp: 'Loaded %s\'s Profile.' },
		UPDATED: 	{ status: 200, help: false, temp: 'Updated %s\'s Profile.' },
		PROFILE: 	{ status: 200, help: false, temp: '%s\'s Profile.' },
	};
	const PRM = {
		GET: 	'query',
		POST: 	'body',
		PUT: 	'body',
		DELETE: 'query',
	}


/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = { UER: UER, MSG: MSG, PRM: PRM };


/////////////////////////////////////////////////////////////////////////////////////////////
