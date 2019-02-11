
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const {
		colors, Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
		ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
		ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
		preARGS, Dbg, LG, TLS, JSN
	} = require('dffrnt.utils');

	// General
		const { Settings } 	= require('dffrnt.confs').Init();

	// Header Requires
		const compression 	= require('compression');
		const bodyParser 	= require('body-parser');
		const cookie 		= require('cookie-parser');
		const crypto 		= require('crypto-token');

	// Auth Requires
		const passport 		= require('passport');
		const useLDAP   	= !!Settings.Session.LDAP;
		const loclauth 		= require('passport-local').Strategy;
		const jwt 			= require('json-web-token');
		const md5 			= require('md5');

	// Session Requires
		const events 		= require('events');
		const session 		= require('express-session');
		const redis 		= require('redis').createClient;
		const connRedis 	= require('connect-redis');
		const socketIO 		= require('socket.io');
		const cors 			= require('cors');


/////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = function Session(server, app) {

		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Handle Functions -----------------------------------------------------------------------------

			function redisRetry (options) {
				// End reconnecting on a specific error and flush all commands with a individual error
				if (options.error.code === 'ECONNREFUSED') return new Error('The server refused the connection');
				// End reconnecting after a specific timeout and flush all commands with a individual error
				if (options.total_retry_time > 1000 * 60 * 60) return new Error('Retry time exhausted');
				// End reconnecting with built in error
				if (options.times_connected > 10) return undefined;
				// reconnect after
				return Math.max(options.attempt * 100, 3000);
			}
			function stripSID (sid) { return sid.replace(/^sess:/, ''); }
			function sendLoad (which) {
				const 	payloads 	= {
							Logout: {
								status:  200, payload: { options: {
									query:{ path: '/auth/logout' }
								}, 	result: { code: 2, message: 'User Logged Out.' } }
							},
							Expired: {
								status:  200, payload: { options: {
									query:{ path: '/auth/logout' }
								}, 	result: { code: 3, message: 'Session Expired.' } }
							},
							Regenerate: {
								status:  200, payload: { options: {
									query:{ path: '/auth/regenerate' }
								} 	}
							},
						};
				return 	function (sid, strict) {
					var payload = payloads[which];
					if (!!sid)  		 THS.Accessor
											.to(stripSID(sid))
											.compress(true)
											.emit('receive', payload);
					else if (!!!strict)  THS.IO
											.compress(true)
											.emit('receive', payload);
				}
			}


		/////////////////////////////////////////////////////////////////////////////////////////////////
		// LDAP OBJECT ----------------------------------------------------------------------------------

			var LDAPR = function (options) {};
			// FUNCTIONS   ///////////////////////////////////////////////////////////////
				DEFINE(LDAPR.prototype, {
					_func: 		HIDDEN(function (name) {
						var CLI = this.Client;
						return function () {
							return CLI[name].apply(CLI, ARGS(arguments));
						}
					}),
					Bind:  		{ get: function () { return this._func('bind'); 	} },
					UnBind:  	{ get: function () { return this._func('unbind'); 	} },
					Destroy:  	{ get: function () { return this._func('destroy'); 	} },
					Add:  		{ get: function () { return this._func('add'); 		} },
					Compare:  	{ get: function () { return this._func('compare'); 	} },
					Del:  		{ get: function () { return this._func('del'); 		} },
					Exop:  		{ get: function () { return this._func('exop'); 	} },
					Modify:  	{ get: function () { return this._func('modify'); 	} },
					Change:  	{ get: function () { return this._func('Change'); 	} },
					ModifyDN:  	{ get: function () { return this._func('modifyDN'); } },
					Search: 	HIDDEN(function (acct, callback) {
						var qry = cfgLDAP.query(acct);
						this.Client.search(qry.base, qry.opts, callback);
					}),
					Open: 		HIDDEN(function () {
						var OPEN = this.Open.bind(this), KILL = this.Destroy.bind(this);
						this.Client = LDAPjs.createClient(this.options);
						// -------------------------------------------------------------------
						new ELOGR(this.Client, cfgLDAP.port, 'LDAP',  {
							connect: 	{ kind:'msg', msg:'initialized', clr:'magenta' 				},
							idle: 		{ kind:'msg', msg:'idle', 		 func:KILL					},
							close: 		{ kind:'msg', msg:'unbinded', 	 func:OPEN, 	clr:'grey' 	},
							destroy: 	{ kind:'msg', msg:'destroyed', 	 func:OPEN 					},
							error: 		{ kind:'err' },
						});
						// -------------------------------------------------------------------
						this.Bind(cfgLDAP.admin, cfgLDAP.passwd, function (err) {
							var proc = { true: 'Error', false: 'Server' },
								args = (!!err ? [err.message] : ['Binded', 'magenta']),
								logr = [cfgLDAP.port, 'LDAP'].concat(args),
								func = proc[!!err]; LG[func].apply(this, logr);
							// console.log(LDAP)
						});
					}),
				});
			// CONSTRUCTOR ///////////////////////////////////////////////////////////////
				var LDAPR = EXTEND(LDAPR, function LDAPR (options) {
					this.options = options; this.Open();
				});


		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Handle Requires ------------------------------------------------------------------------------
			const THS = {};

			// General
				let		Connection 	= null;
				const 	SCFG 		= Settings.Session;
				const 	Create 		= Object.create;

			// Session Vars
				const 	IO 			= 	socketIO(server);
				const 	CL 			= 	(Settings.Services||null);

			// Config Vars
				const 	secret 		= SCFG.Secret||'';
				const 	age 		= Assign({
										  In:  ((3600*1000)*4),
										  Out: ((3600*1000)*4),
									  },SCFG.Age);
				const 	Limiter 	= require('express-limiter'); // (app, Limits);


		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Handle Exposure ------------------------------------------------------------------------------

			THS.setSQLConn 	= function setSQLConn(con) { Connection = con; };
			THS.Limiter		= Limiter;
			THS.JWT			= jwt;
			THS.CL			= CL;
			THS.Cookie 		= { Secret: secret, Age: age };

		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Setup Auth/Sessions --------------------------------------------------------------------------

			// Session Config
				app.use(compression());
				app.use(cookie(secret));
				app.use(bodyParser.urlencoded({ extended: false }));
				app.use(bodyParser.json());

			// Handle Sessions Stores
				try {
					const 	store 		= 	connRedis(session);

					// Events
						const 	EVT_ALL 	= '__key*__:*';
						const 	EVT_EXP 	= '__keyevent@0__:expired';
						const 	EVT_SET 	= '__keyevent@0__:set';
						const 	EVT_HST 	= '__keyevent@0__:hset';
						const 	EVT_MST 	= '__keyevent@0__:mset';

					// Stores
						const 	redisHost 	= SCFG.REDIS.Config.Host||'localhost';
						const 	redisPass 	= SCFG.REDIS.Config.Password||'';
						const 	redisPort 	= SCFG.REDIS.Config.Port||'6379';
						const 	config 		= {
									store: {
										host: 			redisHost,
										port: 			redisPort,
										auth_pass: 		redisPass,
										password: 		redisPass,
										retry_strategy: redisRetry,
									},
									ldap: SCFG.LDAP
								};
						const 	CStore 		= new store(config.store);
						const 	Events		= redis(config.store);
						
						THS.Stores = { [SCFG.REDIS.Main]: CStore.client };
						SCFG.REDIS.Stores.map(s => (THS.Stores[s]=redis(config.store)))
								
						const 	sessMDW 	= session({
									store:  			CStore,
									secret: 			secret,
									key: 				'express.sid',
									resave: 			false,
									httpOnly: 			false,
									cookie: 			{ maxAge: age.Out },
									saveUninitialized: 	true,
									rolling: 			true,
								});

						app.use(sessMDW);
						// app.use(cors({origin:'http://localhost:3001'}));
						
					// User Auth Config
						if (useLDAP) {
							const cfgLDAP = config.ldap;
							passport.use(new ldapauth({
								usernameField: "username",
								passwordField: "password",
								server: {
									url: 				cfgLDAP.url(),
									adminDn: 			cfgLDAP.admin,
									adminPassword: 		cfgLDAP.passwd,
									searchBase: 		cfgLDAP.base,
									searchFilter: 		cfgLDAP.filter.auth,
									searchAttributes: 	['sAMAccountName'],
									tlsOptions: 		cfgLDAP.certs
								}
							}));
							// User Profile Config ---------------------------------------
							const LDAP = new LDAPR({ url: cfgLDAP.url() });
							THS.LDAP = LDAP;
						} else {
							const authCFG = { passReqToCallback : true };
							const authSQL = SCFG.Auth.SQL.Login;
							passport.use('local-login', new loclauth(authCFG,
								// callback with email and password from our form
								async (req, username, password, next) => {
									try {
										let con = await Connection.acquire(),
											{ rer, ret } = await con.query(
												authSQL, [ username ]
											),	info = '';
										
										// if the user email does not exist
										if (!ret.length) info = 'No User with that Email, sorry.';
										// if the user is found but the password is wrong
										if (md5(password) !== ret[0].user_pass) info = 'Wrong password.';
										// all is well, return successful user
										return next(rer, ret[0], info);
										
									} catch (err) {
										LG.Error(err.message, 'Database', 'GET')
									}
								}
							)	);
						}; 	app.use(passport.initialize());

						THS.Regenerate 	= sendLoad('Regenerate');
						THS.Expired 	= sendLoad('Expired');
						THS.Logout 		= sendLoad('Logout');
						THS.Accessor 	= null;
						THS.Auth 		= SCFG.Auth;
						THS.Passport	= passport;

					// Session Store Setup/Logging
						THS.Sender 		= new events.EventEmitter();

						let RedLogs = (dbi,clr='grey',name) => ({
								connect: Assign({ msg:'initialized' }, { func() {
												!!dbi && this.cli.select(dbi, this.log({kind:'err'}));
												if (!!THS.Auth.Flush||name=='Limits') this.cli.flushdb();
											}	}),
								error: 	 { kind:'err' },
								end: 	 { msg:'Terminated', clr:clr },
							});

						Object.keys(THS.Stores).map((s,i) => new ELOGR(
							THS.Stores[s], redisPort, s, RedLogs(i,null,s)
						)	);

						new ELOGR(Events,  redisPort, 'Events', {
							connect: 	{ msg:'initialized' },
							error: 		{ kind:'err' },
							subscribe: 	{ func(channel, count) {
											var evt = channel.split(':'), msg = evt[1];
											this.log({ msg: 'subscribed: '+msg, clr: 'cyan' })();
										}, kind: 'own' },
							message: 	{ func(channel, message) {
											var evt = channel.split(':'), msg = evt[1], key = message;
											switch (channel) {
												case EVT_EXP: 	this.log({ key: key, msg: msg, clr: 'red' })();
																THS.Expired(message, true); break;;
												case EVT_SET: 	this.log({ key: key, msg: msg, clr: 'magenta' })()
																break;;
											}
										}, kind: 'own' },
							end: 		{ msg:'Terminated', clr:'grey' },
						}); Events.subscribe(EVT_EXP); Events.subscribe(EVT_SET);

					// This endpoint is hit when the browser talks to the Server
						IO.use((socket, next) => {
							sessMDW(socket.request, socket.request.res, next);
						});
						THS.IO = IO;
				
				} catch (e) {
					console.log(e);
				}

		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Export ---------------------------------------------------------------------------------------

			return THS;
	}
