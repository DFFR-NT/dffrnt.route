
'use-strict';

// ----------------------------------------------------------------------------------------------
// Handle Requires ------------------------------------------------------------------------------

	/** @type {import('dffrnt.route')} */
	module.exports = {
		Help: 		require('./lib/help'),
		Routes: 	require('./lib/routes'),
		Session: 	require('./lib/session'),
		REST: 		require('./lib/rest'),
		Errors: 	require('./lib/errors')
	};