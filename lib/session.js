
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const {
		colors, Assign, Imm, StrTime, ROOTD, path, os, fs,
		ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
		ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
		preARGS, Dbg, LG, TLS, JSN, FromJS
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
		const helmet 		= require('helmet');
		const uid_safe 		= require('uid-safe');
		const cors 			= require('cors');


/////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	/**
	 * Initializes & returns the session-specific class & modules.
	 * @param {import('http').Server} server The `HTTP-Server` object.
	 * @param {ExpressJS} app The initialized `ExpressJS` application.
	 * @returns {SESS.App} The session namespace.
	 */
	module.exports = function Session(server, app) {

		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Handle Functions -----------------------------------------------------------------------------

			/**
			 * ...
			 * @param {{}} options ...
			 */
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
			/**
			 * Strips a `sessionID` of it's "fluff."
			 * @param {string} sid The `sessionID` to strip.
			 */
			function stripSID (sid) { return sid.replace(/^sess:/, ''); }
			/**
			 * A factory that creates a `function` that sends predefined, session-based `payloads` to a `socket`.
			 * @param {('Notify'|'Regenerate'|'Expired'|'Logout')} which The name of `payload` to send.
			 * @returns {SESS.SendLoad} The `function` that will send the `payload`.
			 */
			function sendLoad (which) {
				let NTFID = THS.Auth.Paths.ALERT;
				/**
				 * @type {{[which:string]:ROUT.JSN.Response}}
				 */
				const 	payloads 	= {
							Notify: {
								status:  200, payload: { options: {
									body: { path: NTFID, id: '' }
								}, 	result: {
									type: 'alert', ack: false,
								} 	}
							},
							Regenerate: {
								status:  200, payload: { options: {
									query:{ path: '/auth/regenerate' }
								} 	}
							},
							Logout: {
								status:  200, payload: { options: {
									query:{ path: THS.Auth.Paths.OUT }
								}, 	result: { code: 2, message: 'User Logged Out.' } }
							},
							Expired: {
								status:  200, payload: { options: {
									query:{ path: THS.Auth.Paths.OUT }
								}, 	result: { code: 3, message: 'Session Expired.' } }
							},
						};
				return 	function (sid, strict, data) {
					var response = payloads[which];
					if (which=="Notify") {
						response.payload.options.body.id = data.type||'alert';
						response.payload.result = FromJS(
							response.payload.result||{}
						).mergeDeep(
							FromJS(data||{})
						).toJS();
					};
					switch (true) {
						case !!sid: 
							THS	.Accessor
								.to(stripSID(sid))
								.compress(true)
								.emit('receive', response);
							break;;
						case !!!strict:
							THS	.IO
								.compress(true)
								.emit('receive', response);
							break;;
					}
				}
			}

		/////////////////////////////////////////////////////////////////////////////////////////////////
		// LDAP OBJECT ----------------------------------------------------------------------------------

			/**
			 * An object for handling LDAP authentication.
			 */
			class LDAPR {

				// CONSTRUCTOR ///////////////////////////////////////////////////////////////

					/**
					 * Instantiates a new `LDAPR` instance.
					 * @param {{}} options Options to for initializing the `LDAP` server.
					 */
					constructor(options) {
						this.options = options; this.Open();
					};

				// ACCESSORS   ///////////////////////////////////////////////////////////////

					get Bind    () { return this._func('bind');     }
					get UnBind  () { return this._func('unbind');   }
					get Destroy () { return this._func('destroy');  }
					get Add     () { return this._func('add');      }
					get Compare () { return this._func('compare');  }
					get Del     () { return this._func('del');      }
					get Exop    () { return this._func('exop');     }
					get Modify  () { return this._func('modify');   }
					get Change  () { return this._func('Change');   }
					get ModifyDN() { return this._func('modifyDN'); }

				// FUNCTIONS   ///////////////////////////////////////////////////////////////

					/**
					 * Calls `LDAPJS` functions against the current `LDAP` Client.
					 * @param {string} name The name of the `LDAPJS` function to call.
					 */
					_func(name) {
						var CLI = this.Client;
						return function (...args) {
							return CLI[name](...args);
						}
					}

				// PROCEDURES  ///////////////////////////////////////////////////////////////
				
					/**
					 * Searches for an `account` in the current `LDAP` server.
					 * @param {string} acct The `account-name` to process.
					 * @param {*} callback 
					 */
					Search(acct, callback) {
						var qry = cfgLDAP.query(acct);
						this.Client.search(qry.base, qry.opts, callback);
					}

					/**
					 * Opens a connection to an `LDAP` server given this instance's `options`.
					 */
					Open() {
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
					}

			}


		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Handle Requires ------------------------------------------------------------------------------
			/** @type {SESS.App} */ const THS = {};

			// General ----------------------------------------------------------------------------------
				let		Connection 	= null;
				const 	SCFG 		= Settings.Session;

			// Session Vars -----------------------------------------------------------------------------
				const 	IO 			= 	socketIO(server);
				const 	CL 			= 	(Settings.Services||null);

			// Config Vars ------------------------------------------------------------------------------
				const 	secret 		= SCFG.Secret||'';
				const 	age 		= Assign({
										  In:  ((3600*1000)*4),
										  Out: (1000*10),
									  },SCFG.Age);
				const 	Limiter 	= require('express-limiter'); // (app, Limits);


		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Handle Exposure ------------------------------------------------------------------------------

			/** 
			 * Sets the `MySQL` Connection object in the `REST API`.
			 * @param {MySQL.Connection} con A MySQL Connection.
			 */ 
			THS.setSQLConn 	= function setSQLConn(con) { Connection = con; };
			THS.Limiter		= Limiter;
			THS.JWT			= jwt;
			THS.CL			= CL;
			THS.Cookie 		= { Secret: secret, Age: age };
			THS.Plugins		= Imm.Map(Settings.Plugins).map((v,k,i,a,F)=>(
									eval(`F=${v.toString()}`),F()
								)).toJS();

			// console.log(THS.Plugins)

		/////////////////////////////////////////////////////////////////////////////////////////////////
		// Setup Auth/Sessions --------------------------------------------------------------------------

			// Suit Up ----------------------------------------------------------------------------------
				if (!!Settings.SSL) {
					app.use(helmet.expectCt({ enforce: true, maxAge: 30 }));
					app.use(helmet.dnsPrefetchControl());
					app.use(helmet.frameguard({ action: 'sameorigin' }));
					app.use(helmet.hidePoweredBy());
					app.use(helmet.hsts({
						maxAge: 31536000,
						includeSubdomains: true,
						preload: true,
						force: true
					}));
					app.use(helmet.ieNoOpen());
					app.use(helmet.noSniff());
					app.use(helmet.xssFilter());
				};

			// Session Config ---------------------------------------------------------------------------
				app.use(compression());
				app.use(cookie(secret));
				app.use(bodyParser.urlencoded({ extended: false }));
				app.use(bodyParser.json());

			// Handle Sessions Stores -------------------------------------------------------------------
				try {
					const 	store 		= 	connRedis(session);
					// Events --------------------------------------------------------------------------
						const 	EVT_ALL 	= '__key*__:*';
						const 	EVT_EXP 	= '__keyevent@0__:expired';
						const 	EVT_DEL 	= '__keyevent@0__:del';
						const 	EVT_SET 	= '__keyevent@0__:set';
						const 	EVT_HST 	= '__keyevent@0__:hset';
						const 	EVT_MST 	= '__keyevent@0__:mset';
						const 	EVT_NTF 	= '__keyevent@5__:set';

					// Stores --------------------------------------------------------------------------
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
						
						THS.Stores = { [SCFG.REDIS.Main.Name]: CStore.client };
						SCFG.REDIS.Stores.map(s => (THS.Stores[s.Name]=redis(config.store)))
								
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
						
					// User Auth Config ----------------------------------------------------------------
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
						} else if (!!SCFG.Auth)  {
							const authCFG = { passReqToCallback : true };
							const authSQL = SCFG.Auth.SQL.Login;
							passport.use('local-login', new loclauth(authCFG,
								// callback with email and password from our form
								async (req, username, password, next) => {
									try {
										let con = await Connection.acquire(),
											{ error, results } = await con.query(
												authSQL, [ username ]
											),	info = '', user;
										// Check for Error
										if (!!!error) {
											// if the user email does not exist
											if (!results.length) info = 'No User with that Email, sorry.';
											else user = results[0];
											// if the user is found but the password is wrong
											if (md5(password) !== user.password) info = 'Wrong password.';
										};
										console.log(user)
										// all is well, return successful user
										return next(error, user, info);
										
									} catch (err) {
										LG.Error(err.message, 'Database', 'GET')
									}
								}
							)	);
						}; 	app.use(passport.initialize());

					// Expose Plugins ------------------------------------------------------------------
						THS.Auth 		= SCFG.Auth||{};
						// Set Defaults for Auth Settings; if needed...
							if (!!Object.keys(THS.Auth).length) {
								THS.Auth.Paths = {
									...(THS.Auth.Paths), ...{
										IN:    '/auth/login',
										OUT:   '/auth/logout',
										ALERT: '__notify__',
								}	};
							};
						// ---------------------------------------- //
						THS.Regenerate 	= 	sendLoad('Regenerate');
						THS.Expired 	= 	sendLoad('Expired');
						THS.Logout 		= 	sendLoad('Logout');
						THS.Accessor 	= 	null;
						THS.Passport	= 	passport;
						THS.Group       = 	{
							Get(uid) {
								let { Groups } = THS.Stores;
								return new Promise(res => (
									Groups.GET(uid, (_e, list)=>res(
										JSON.parse(list||'[]')
								))	)	);
							},
							Set(uid, id) {
								let { Groups } = THS.Stores;
								return new Promise(async res => {
									let Group = await THS.Group.Get(uid); 
									if (!Group.has(id)) {
										Group.push(id); Groups.SET(
											uid, JSON.stringify(Group), 
											e => res(!!!e)
								);	}	});
							},
							Rem(uid, id, invert = false) {
								let { Groups } = THS.Stores,
									  CB = (res)=>(e=>res(!!!e)), 
									  ID = (id)=>`sess:${id}`,
									JSNS = JSON.stringify;
								return new Promise(async res => {
									let Group = await THS.Group.Get(uid);
										/** 
										 * @type {string[]} 
										 */ 
										let Vctms = [];
										/** 
										 * @type {string[]} 
										 */ 
										let Srvvr = []; 
									if (!!invert) {
										Srvvr = Group.filter(s=>(s==id));
										Vctms = Other.map(id=>ID(id));
									} else {
										Srvvr = Group.filter(s=>(s!=id));
										Vctms = [ID(id)];
									};
									THS.Stores.Client.DEL(...Vctms, (_e, c) => {
										if (c>0) Groups.SET(uid, JSNS(Srvvr), CB(res));
										else res(false);
									});
								});
							},
							async List(uid) { 
								let Result = []; try {
									let Group  = await THS.Group.Get(uid), 
										Client = THS.Stores.Client,
										List   = await Promise.all(
													Group.map(SID => new Promise(res => (
														Client.GET(`sess:${SID}`, (_e, sess) => res(
															Assign({ ssid: SID },
																(JSON.parse(sess||'{}').user||{}).client||{}
												)	))	))	));
									// Filter out expired sessions
									Result = List.filter((S,i) => {
										let res = (Object.keys(S).length>1);
										res || (Group[i]=null); return res;
									});
									// Save Sanitized List
									if (Result.length != Group.length) {
										let { Groups } = THS.Stores;
										await new Promise((res) => Groups.SET(
											uid, JSON.stringify(Group.filter(S=>!!S)), e=>res(!!!e)
										)	);
									};
									// Return
									return Result;
								} catch (err) { 
									console.error(err); 
									return [];
								};
							},
						};
						THS.Alert 		=   {
							Keys(uid) {
								return new Promise(res => (
									THS.Stores.Alerts.SCAN(
										'0', 'match', `${uid}:*`,  
										(_e,list)=>res((list||[0,''])[1])
								)	)	);
							},
							Exists(uid, id) {
								return new Promise(async res => (
									res(await THS.Alert.Keys(uid)).has(`${uid}:${id}`)	
								)	);
							},
							async Post(uids, alert) {
								let stamp = Date.now();
								/**
								 * Generates a new alertID for the user.
								 * @param {string[]} keys The current alertIDs for the user.
								 * @returns {string}
								 */
								let nuid  = async uid => {
												let keys = await THS.Alert.Keys(uid),
													len  = 6, alid;
												alid = await uid_safe(len)
												while (keys.has(alid)) {
													alid = await uid_safe(len);
												};	return alid;
											};
								// ------------------------------------------------- //
								if (!!!(alert||Object.keys(alert).length)) return;
								else try { 
									/**
									 * @type {string[]}
									 */
									let list = 	Array.isArray(uids)?uids:[uids],
										payl =  JSON.stringify(Assign({},alert,{stamp})), 
										aidl = 	await Promise.all(list.map(
													async uid => `${uid}:${(await nuid(uid))}`,
												));
									// Post Alert
									return new Promise(async res => {
										THS.Stores.Alerts.MSET( 
											...aidl.reduce((p,k)=>(p.push(k,payl),p),[]), 
											(_e,rep)=>res(rep)
										);	
									});
								} catch(e) { throw e; };
							},
							Get(id) {
								return new Promise((res, rej) => (
									THS.Stores.Alerts.GET(id, (err, data) => {
										!!err && rej(err) || res(JSON.parse(data))
									})
								));
							},
							Broadcast: sendLoad('Notify'),
							Acknowledge(id) {
								let ids = ISS(id)=="array"?id:[id];
								return new Promise(res => (
									THS.Stores.Alerts.DEL(ids, err=>res(!!!err))
								));
							},
							List(uid) {
								return new Promise(async res => { try {
									/**
									 * @type {string[]}
									 */
									let keys = await THS.Alert.Keys(uid);
									/**
									 * @type {SESS.AlertObj[]}
									 */
									let vals = await new Promise(r => (
											THS.Stores.Alerts.MGET(
												...keys, (_e, rep)=>r(
													rep.map(v=>JSON.parse(v))
										)	)	));
									res(vals.sort((a,b)=>(
										a.stamp<b.stamp?1:(a.stamp>b.stamp?-1:0)
									)));
								} catch (e) { throw e; } });
							},
						};
					// Session Store Setup/Logging -----------------------------------------------------
						THS.Sender 		= new events.EventEmitter();

						let allStrs  	= [SCFG.REDIS.Main, ...SCFG.REDIS.Stores];
						let auFlushes   = ['Client','Users','Groups'];
						/**
						 * Determines if a `REDIS` DB is to be flushed.
						 * @param {string} name The name of the `REDIS` DB.
						 * @param {boolean} flush The flush value of the `REDIS` DB config.
						 * @returns {boolean}
						 */
						let shFlush  	= (name, flush) => (auFlushes.has(name)&&THS.Auth.Flush||flush);
						/**
						 * A logging-propery factory for `REDIS` DBs.
						 * @param {number} dbi The index of the `REDIS` DB.
						 * @param {string} name The name of the `REDIS` DB.
						 * @param {boolean} flush If `true`, flushes the `REDIS` DB on startup.
						 * @param {LogColors} [clr] The log-text color.
						 */
						let RedLogs  	= (dbi,name,flush,clr='grey') => ({
								connect: 	Assign({ msg:'initialized' }, { func() {
												!!dbi && this.cli.select(dbi, this.log({kind:'err'}));
												if (shFlush(name,flush)) this.cli.flushdb();
											}	}),
								error: 	 	{ kind:'err' },
								end: 	 	{ msg:'Terminated', clr:clr },
							});

						allStrs.map((s) => new ELOGR(
							THS.Stores[s.Name], redisPort, s.Name, RedLogs(s.Index,s.Name,s.Flush)
						)	);

						new ELOGR(Events,  redisPort, 'Events', {
							connect: 	{ msg:'initialized' },
							error: 		{ kind:'err' },
							subscribe: 	{ func(channel, count) {
											var evt = channel.split(':'), msg = evt[1];
											this.log({ msg: 'subscribed: '+msg, clr: 'cyan' })();
										}, kind: 'own' },
							message: 	{ async func(channel, message) {
											var evt = channel.split(':'), msg = evt[1], 
												key = message, clr = 'cyan';
											switch (channel) {
												case EVT_EXP: case EVT_DEL:
													clr = 'red';
													THS.Expired(message, true); 
													break;;
												case EVT_SET: 
													clr = 'magenta';
													break;;
												case EVT_NTF: 
													clr = 'magenta';
													let ALERT = THS.Alert,
														[ uid, alid ] = message.split(':'),
														group = await THS.Group.Get(uid),
														alert = await ALERT.Get(message);
													alert.id = alid;
													await Promise.all(group.map(SS => (
														new Promise(rslv=>rslv(
															ALERT.Broadcast(SS,true,alert)
														))	
													)));
													break;;
											};	this.log({ key, msg, clr })();
										}, kind: 'own' },
							end: 		{ msg:'Terminated', clr:'grey' },
						}); 

							Events.subscribe(EVT_EXP); 
							Events.subscribe(EVT_DEL); 
							Events.subscribe(EVT_SET);
							Events.subscribe(EVT_NTF);

					// This endpoint is hit when the browser talks to the Server -----------------------
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

/////////////////////////////////////////////////////////////////////////////////////
