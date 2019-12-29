/// <reference types="dffrnt.confs" />
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// DEFINITIONS

	/**
	 * The `method` of the `Remote` request
	 * @typedef {'GET'|'PUT'|'POST'|'DELETE'} ReqMethod
	 */	

	/**
	 * The `params` for the `Remote` request
	 * @typedef {Object.<string, any>} ReqParams
	 */	

	/**
	 * The `body` or `query` options for the `Remote` request
	 * @typedef {Object.<string, any>} ReqOptions
	 */

	/**
	 * A list of `File` objects for a `Remote` request
	 * @typedef {File[]} ReqFiles
	 */

	/**
	 * The `body`, `files`, and/or `query` options for the `Remote` request
	 * @typedef  {Object}     ReqProps
	 * @property {ReqParams} [params={}] The `params` for the `Remote` request
	 * @property {ReqParams} [query={}]  The `query` for the `Remote` request
	 * @property {ReqParams} [body={}]   The `body` for the `Remote` request
	 * @property {ReqFiles}  [files=[]]  The `files` for the `Remote` request
	 */

	/**
	 * A callback that handles the request response
	 * @callback CBRemote
	 * @param    {...any} args
	 * @void
	 */

	/**
	 * @callback CBSetParam
	 * @param {CFG.PNTS.Data.Method} MQ 
	 * @param {string} N 
	 * @param {GNParam} V 
	 * @returns {GNParam}
	 */

	/**
	 * @typedef {('Header' | 'Param')} TPParamMode
	 */

	
	/**
	 * @callback CBonSuccess
	 * @param {*} rer 
	 * @param {*} ret 
	 */
	/**
	 * @callback CBonFailure
	 * @param {*} ident 
	 */
	/**
	 * @callback CBonTimer
	 */

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  	{ Assign, Imm, StrTime, ROOTD, path, os, fs,
			  CNAME, ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
			  ISS, OF, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
			  preARGS, Dbg, LG, TLS, JSN, FromJS
			} 					   = require('dffrnt.utils');
	const  	{ AuthP, EndP 		 } = require('dffrnt.confs').Init();
	const 	{ RouteAU, RouteDB, 
			  GNHeaders, GNParam, GNDescr, 
			  PType, PT, _Methods, 
			} 					   = require('dffrnt.confs'); 
	const  	{ UER,   MSG,   PRM  } = require('./errors');
	const  	{ SQL, Connection    } = require('dffrnt.model');
	const  	  Helper 			   = require('./help');
	const  	  TZ 				   = require('tzdata'); // !?!?!?!?!?!?!?!?
	const  	  MD5 				   = require('md5');

	/** 
	 * @typedef  {Object}  METHOD_MAP 
	 * @property {"query"} METHOD_MAP.GET
	 * @property {"body"}  METHOD_MAP.PUT
	 * @property {"body"}  METHOD_MAP.POST
	 * @property {"body"}  METHOD_MAP.DELETE
	 * @property {"body"}  METHOD_MAP.MIDDLEWARE
	 * @constant
	 */
	const  	METHOD_MAP = {
				GET: 'query', 
				PUT: 'body', 
				POST: 'body',
				DELETE: 'body', 
				MIDDLEWARE: 'body'
			};
	const 	AMP = '+', ORS = ';', PIP = '|';
	const   NoStores = ['Client','Users','Limits','Lockers','Alerts'];
	
	let Help 		= new Helper({ Params: {
			Page:  ['SQL', { Format: cls => (!!cls.page ? SQL.OFFSET((parseInt(cls.page||0)-1)*parseInt(cls.limit)) : '') }],
			Limit: ['SQL', { Format: cls => SQL.LIMIT(parseInt(cls.limit)), Default: null }],
		}	});
	/**
	 * @type {SESS.App}
	 */
	let Session 	= null;
	/**
	 * @type {{[pointName:string]:(AURequest|DBRequest)}}
	 */
	let Points 		= {};
	/**
	 * @type {{AuthP:CFG.AuthPoints,EndP:CFG.DataPoints}}
	 */
	let Config 		= {};
	/**
	 * @type {{[pluginName:string]:{}}}
	 */
	let Plugins 	= {};
	/**
	 * A collection of `REDIS` DBs available to Endpoit definitions.
	 * @type {{[dbName:string]:RedisStore}}
	 */
	let Stores      = {};
	/**
	 * The Alert-Notification Collection.
	 */
	let Alert		= {};
	/**
	 * @type {Remote}
	 */
	let _Remote 	= null;
	let CONN 		= new Connection();

/////////////////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS

	/**
	 * Hydrates body-params with the appropriate auth-path. These paths tell the client 
	 * whether to consider the user logged-in or to log them out by force.
	 * @param {('IN'|'OUT')} which `IN`, for valid sessions, `OUT` to force a client logout.
	 * @param {ROUT.JSN.Body} body The current body-params.
	 * @param {boolean} unlocked If `true`, does not hydrate..
	 * @returns {ROUT.JSN.Body}
	 */
	function STATE(which, body, unlocked = false) { 
		// if (which=="OUT" && !!unlocked) return body;
		if (!!unlocked) return body;
		let P = Session.Auth.Paths;
		return { 
			...(body||{}), 
			...({ path: P[which] }) 
		}; 
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// General Handler

	/**
	 * A REST API Interface for Endpoint Handling & Documentation
	 */
	class GNRequest { 
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of GNRequest.
			 * @param {string} Name The name of the request route
			 * @param {CFG.PNTS.Base<RouteAU|RouteDB>} Configs The configurations for the request route 
			 */
			constructor(Name, Configs) {
				/**
				 * @type {string}
				 */
				this.Name = Name; 
				/**
				 * @type {import('immutable').OrderedMap<string,Date>}
				 */
				this._start = Imm.Map({});
				/**
				 * @type {string}
				 */
				this.NME = "/"+Name.toLowerCase();
				// Set Any Utilities
				/** 
				 * @name GNRequest#Utils
				 * @type {CLPointUtils}
				 * @memberof GNRequest
				 */
				this.Utils = Configs.Utilities||{};
				// Add Endpoints
				/** 
				 * @name GNRequest#Requests
				 * @type {import('immutable').OrderedMap<string,(RouteAU|RouteDB)>}
				 * @memberof GNRequest
				 */
				this.Requests = Imm	.OrderedMap(Configs.Actions)
								  	.map((v, k)=>(v.Name=k,v));
			}

		/// ENFORCERS   /////////////////////////////////////////////////////////////////////

			/**
			 * Sends an `Error` response to the Client
			 *
			 * @param {ExRequest} req The Client `HTTP` `Request` instance
			 * @param {ExResponse} res The Server `HTTP` `Response` instance
			 * @param {Error} err The `Error` instance
			 * @memberof GNRequest
			 */
			Error	(req, res, err) {
				let url  = req.query.path = req.originalUrl,
					stat = err.status||400, msg = err.temp,
					opts = { options: {
						params: req.params, query: req.query
					}	},
					help = JSN.Help(
						url, msg, Help.Get(this.Name, url), stat
					).payload,
					load = Assign({}, help, opts);
				res.status(stat).send( load );
			}

			/**
			 * Sends an `Limit` response to the Client when a 
			 * limit-rate has been reached
			 *
			 * @param {ExRequest} req The Client `HTTP` `Request` instance
			 * @param {ExResponse} res The Server `HTTP` `Response` instance
			 * @memberof GNRequest
			 */
			Limit	(req, res) {
				let THS  = this, 
					qry  = req.query||req.body, 
					sess = req.session||{};
				qry.path = qry.id; THS.ER(
					res, MSG.RATELIMIT, { sessionID: req.sessionID }, 
					((sess.user||{}).acct||''), qry
				)
			}

		/// DISTIBUTORS /////////////////////////////////////////////////////////////////////

			/**
			 * Renders a message specific to a `User` account via a provided template.
			 *
			 * @param {string} msg A `sprintf`-style string template.
			 * @param {string} acct A username, email, etc.
			 * @returns {string} A formatted message directed to a specific `User`.
			 * @memberof GNRequest
			 */
			MS  	(msg, acct) {
				return msg.replace(/%s/g, acct); 
			}
			/**
			 * Sends a User-Info Server Response to a Client (`HTTP` or `Socket`).
			 *
			 * @param {ExResponse} res An `HTTP` or `Socket` instance.
			 * @param {string} msg A message regarding the response.
			 * @param {ROUT.User} usr The user-info object.
			 * @param {string} acct A username, email, etc.
			 * @param {ROUT.JSN.Query} bdy The `body` object from the request.
			 * @param {number} cde The payload status code (_this is **NOT** the `HTTP` status_).
			 * @param {ExNext} next The `next` step in the process.
			 * @memberof GNRequest
			 */
			OK  	(res, msg, usr, acct, bdy, cde, next) {
				var name = (usr.Account || acct), stat = 200,
					payd = { message: this.MS(msg, name), user: usr, next: next },
					opts = { body: Assign({}, { path: '/auth/logout' }, bdy||{}) },
					rtrn;
				if (IaN(cde)) payd.code = cde;
				rtrn = JSN.Valid(payd, opts, {},  stat);
				rtrn.all = this.ALL; res.status(stat).send(rtrn.payload);
			}
			/**
			 * Sends a Server Response to a Client (`HTTP` or `Socket`)
			 *
			 * @param {exResponse} res An `HTTP` or `Socket` instance
			 * @param {ROUT.JSN.Payload} pay The "payload" object to send to the Client
			 * @param {ROUT.JSN.Options} opts The "options" object, which includes the `params`, `query`, `body`, etc.
			 * @param {number} status The `HTTP` status code
			 * @memberof GNRequest
			 */
			SN  	(res, pay, opts, status) {
				var stat = (status || 200), link = opts.Links,
					rtrn = JSN.Valid(pay, opts.Options, link, stat);
				res.status(stat).send(rtrn.payload);
			}
			/**
			 * Sends an Error Response to a Client (`HTTP` or `Socket`).
			 *
			 * @param {ExResponse} res An `HTTP` or `Socket` instance.
			 * @param {import('dffrnt.route').Errors.HTTP_MSG} hnd The appropriate Error Response handler.
			 * @param {Error} err The `Error` instance.
			 * @param {string} acct A username, email, etc.
			 * @param {ROUT.JSN.Options} qry The `query` object from the request.
			 * @param {boolean} [all=false] If `true`, send to all subscribers.
			 * @param {boolean} [noSend=false] If `true`, do **NOT** send, just return the result.
			 * @returns {ROUT.JSN.Payload} If `noSend` is `true`, this result object is returned.
			 * @memberof GNRequest
			 */
			ER  	(res, hnd, err, acct, qry, all = false, noSend = false) {
				var msgs = this.MS(hnd.temp, acct), stat = (hnd.status||500),
					payd = { message: JSN.Error(msgs, err), error: err },
					opts = { query: Assign({},{path:'/auth/logout'},qry||{}) },
					rtrn; payd.code = 2;
				rtrn = JSN.Valid(payd, opts, {}, stat); rtrn.payload.all = all; 
				if (!!noSend) return rtrn.payload;
				else res.status(stat).send(rtrn.payload);
			}

		/// UTILITIES   /////////////////////////////////////////////////////////////////////

			/**
			 * Generates a random, unique `HASH` for identifying each `Timer`
			 *
			 * @returns {string} A random, unique `HASH` identifier
			 * @see TimerStart
			 * @see TimerEnd
			 * @memberof GNRequest
			 */
			TimerHash  (    ) {
				return Math.random().toString(36).substring(7);
			}
			/**
			 * Starts a Timer until explicity ended with `TimerEnd()`
			 *
			 * @returns {string} A generated `HASH` identifier
			 * @see TimerHash
			 * @see TimerEnd
			 * @memberof GNRequest
			 */
			TimerStart (    ) {
				let THS = this,  ST = THS._start, hash = THS.TimerHash();
				while (ST.has(hash)) hash = THS.TimerHash();
				ST = THS._start = ST.set(hash, new Date()); 
				return hash;
			}
			/**
			 * Ends the Timer and returns the duration
			 *
			 * @param {string} hash A `HASH` identifier (_gererated by `TimerHash()`_)
			 * @returns {number} The duration of the timed execution
			 * @see TimerHash
			 * @see TimerStart
			 * @memberof GNRequest
			 */
			TimerEnd   (hash) {
				let THS = this, ST = THS._start, res; 
				res = (new Date()-ST.get(hash)); 
				THS._start = ST.delete(hash); return res;
			}

	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Auth Handler

	/**
	 * A REST API Object for Authentication Endpoint Handling & Documentation
	 * @extends {GNRequest}
	 */
	class AURequest extends GNRequest { 
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of AURequest.
			 * @param {string} Name The name of the request route
			 * @param {CFG.PNTS.Base<RouteAU>} Configs The configurations for the request route 
			 */
			constructor(Name, Configs) {
				super(Name, Configs); this.ALL = this.NME;
				// Create Documentation
				Help.Create(Name);
			}

		/// PROPERTIES  /////////////////////////////////////////////////////////////////////

			get Passer  () { return Session.Passport; 	}
			get Token  	() { return Session.JWT; 		}
			get Cookie  () { return Session.Cookie; 	}
			get LDAP  	() { return Session.LDAP; 		}
			get Stores  () { return Session.Stores||{}; }
			get Client  () { return this.Stores.Client; }
			get Users  	() { return this.Stores.Users;  }
			get Script  () { return Session.Auth.SQL; 	}

		/// UTILITIES   /////////////////////////////////////////////////////////////////////

			/**
			 * Decrypts a `Basic-Authentication` string and passes the results to a request for further processes.
			 * @param {ExRequest} req The client request-object.
			 * @param {string} userField The name of the `username` field.
			 * @param {string} passField The name of the `passowrd` field.
			 * @void
			 */
			Decrypt  (req, userField, passField) {
				if (req.headers.hasOwnProperty('authorization')) {
					var auth = req.headers.authorization.split(' ')[1],
						buff = Buffer(auth, 'base64').toString().split(':');
					if (!!buff.length) {
						userField = userField || 'username'; passField = passField || 'password';
						req.body.username = buff[0]; req.body.password = buff.length > 1 ? buff[1] : '';
					}
				}
			}
			/**
			 * Defines the scopes of an `LDAP` user account.
			 * @param {TPQryObject} user The user object.
			 * @returns {{[grandparent:string]:{[parent:string]:{[child:string]:{}}}}} The scope tree.
			 */
			Scopes 	 (user) {
				var flt = function (mem, m) { return mem.match(/Groups/); },
					map = function (mem, m) { return mem.split(/,?[A-Z]+\=/).slice(1,-1).reverse(); };
				return TLS.Tree(user.memberOf.filter(flt).map(map), "&");
			}
			/**
			 * Retrieves and adds an `LDAP` user's photo.
			 * @param {TPQryObject} user The user object.
			 * @returns {({Photo:string}|{})}
			 */
			Photo  	 (user) {
				var ph = user.thumbnailPhoto;
				return !!ph ? { Photo: 'data:image\/gif;base64,'+ph.toString('base64') } : {};
			}
			/**
			 * Parses an `LDAP` user's manager.
			 * @param {string} manager The user's manager property.
			 * @returns {{name:string,link:string}}
			 */
			Boss  	 (manager) {
				var name = manager.split(/,?[A-Z]+\=/)[1].split(' '),
					acct = (name[0].split('')[0]+name[1]).toLowerCase(),
					pnts = '/users/:account:', qry = '?kind=ext';
				return { name: name, link: SQL.SOCKET({ link: pnts+acct+qry }) }
			}
			/**
			 * Formats a user-object into a `ROUT.User`-formatted object.
			 * @param {TPQryObject} row The user-object.
			 * @returns {ROUT.User}
			 */
			Format   (row) {
				var user = Assign({},row), 
					frmt = Session.Auth.Format,
					profile = {}, prfleLst, account, 
					scopes  = {}, scopeLst, uid;
				// Return the Raw object, if no format
				if (!!!frmt) return user;
				// Retrieve the UID & Account
				uid = user[(!!frmt.UID ? frmt.UID : Object.keys(user)[0])];
				account = (!!frmt.Account ? user[frmt.Account] : uid);
				// Construct the Profile object
				prfleLst = frmt.Profile;
				if (!!!prfleLst||prfleLst=="*") profile = user; 
				else prfleLst.map(k=>{profile[k]=user[k];});
				// Construct the Profile object
				scopeLst = (frmt.Scopes||[]);
				scopeLst.map(k=>{scopes[k]=user[k];});
				// Finalize the User object
				return {
					UID:     uid,
					Account: account,
					Profile: profile,
					Scopes:  scopes
				};
			}
			/**
			 * Parse a `JSON` string into an object.
			 * @param {TPQryObject} user The user object.
			 * @returns {TPQryObject}
			 */
			Parse  	 (user) { return !!user ? JSON.parse(user) : {}; }
			/**
			 * Determines if a user's `session-scope/properties` have changed.
			 * @param {TPQryObject} older The currently-stored session's user object.
			 * @param {TPQryObject} newer The current user object.
			 * @returns {boolean}
			 */
			Change   (older, newer) {
				try { return Imm.fromJS(older).equals(Imm.fromJS(newer)) === false; }
				catch (err) { return true; }
			}

		/// FUNCTIONS   /////////////////////////////////////////////////////////////////////

			/**
			 * Decrypts a user-session token into a user-object.
			 * @param {string} token The user-session token.
			 * @returns {Promise<TPQryObject>}
			 */
			DeToken   		(token) {
				var THS = this;
				return new Promise((resolve, reject) => {
					THS.Token.decode( THS.Cookie.Secret, token, function (err, decode) {
						if (!!err||!!!decode) { 
							LG.Error(' {....} ', 'DeToken', err.name+' | '+err.message); 
							reject({});
						} else { resolve(decode.scope); }
					});
				});
			}
			/**
			 * Encrypts a user-object token into a user-session.
			 * @param {TPQryObject} user The user-object
			 * @returns {Promise<string>}
			 */
			Tokenize  		(user) {
				var THS = this, { UID, Account: ACCT } = user, scopes = user.Scopes, 
					payload = Assign({}, {
						iat: new Date().getTime(), ver: "1.0.0", 
							/* "iss": os.hostname(), "aud": "World", */ 
						user: ACCT, scope: scopes,
					});
				return new Promise((resolve, reject) => {
					THS.Token.encode( THS.Cookie.Secret, payload, function (err, token) {
						if (err) {
							LG.Error( ' {....} ', 'Token', TLS.Concat(err.name, err.message));
							reject({});
						} else {
							LG.Server(' {....} ', 'Token', `${UID}:${ACCT}`, 'magenta');
							THS.Users.set(UID, token); 
							resolve(token);
						}
					});
				});
			}
			/**
			 * Finalizes a user's authentication by logging the user into a tracking database.
			 * @param {TPQryObject} user The user-object.
			 * @param {string} withToken If `true`; add the `token` to the user-object.
			 * @returns {string|Error} The user token.
			 */
			async Grant 	(user, withToken) {
				var THS = this, UID = user.UID, token, scope,
					done = function (token) {
						if (!!withToken) { user.Token = token; }; 
						return user;
					};
				// ....
				try { 
					token = await new Promise((resolve, reject) => {
						THS.Users.get(UID, function (error, token) {
							!!error && reject(error) || resolve(token)
						});
					}); 
				} catch (err) { return err; }
				// ....
				try {
					switch (true) {
						case !!!token: 	token = await THS.Tokenize(user); break;;
						default: 		scope = await THS.DeToken(token);
										if (THS.Change(user.Scopes, scope)) {
											token = await THS.Tokenize(user); 
										};
					};	return done(token); 
				} catch (err) { return err; }
			}
			/**
			 * Retrieves a user-object after successful login.
			 * @param {string} acct The user account identifier.
			 * @param {boolean} withToken If `true`; add the `token` to the user-object.
			 * @returns {string|Error} The user token.
			 */
			async Profile   (acct, withToken) {
				let THS = this, erQ = { path: '/error' }, error, results;
				try {
					let con = await CONN.acquire();
					({ error, results } = await con.query({
						sql: THS.Script.Profile, typeCast: SQL.TYPE
					}, 	[acct]));
				} catch(err) {
					LG.Error(err.message, 'Database', 'GET');
					return {};
				}
				try {	
					switch (true) {
						case  !!error: throw [MSG.ERROR,  error, acct, erQ];
						case !!!results: throw [MSG.EXISTS, UER, acct, erQ];
						default: return await THS.Grant(THS.Format(results[0]), withToken);
					}
				} catch(err) { return err; }
			}

			/**
			 * Processes the steps in a authentication series.
			 * @param {CLProcs} config The authenticator-procress.
			 * @returns {Promise<QYAuthResult>}
			 */
			Session   		(config) {
				var THS = this; 
				return async (req, _res, _next) => {
					var sess = req.session, sid = req.sessionID,
						Pick = function Pick (which, obj) {
							var handle = config[which];
							switch (typeof(handle)) {
								case 'string': 
									throw [ MSG[handle], obj, null, 
										STATE('OUT', req.body, req.unlocked)
									];
								case 'function': 
									return handle.apply(THS, [req]); 
							}
						};
					// --
					try {
						if (!!config.Decrypt) THS.Decrypt(req);
						// --
						switch (true) {
							case !!!sess.user: 
								return await Pick('NoData', { sessionID: sid }); 
							default: 
								return await config.Main.apply(THS, [req]);
						}
					} catch (err) { throw err; }
				}
			}

		/// INITIALIZER /////////////////////////////////////////////////////////////////////

			/**
			 * Initializes all Auth-Endpoints
			 * @returns {AURequest}
			 */
			Init  () {
				var THS = this;
				THS.Requests.map(
					/**
					 * @param {RouteAU} RT The `RouteDB` instance of the Endpoint
					 */
					function (RT) {
						THS[RT.Name] = {};
						RT.Methods.map(M=>[M,RT[M]]).filter(M=>!!M[1]).map(MT => {
							let MD = MT[0], MQ = MT[1], Handle = null;
							// Document ---------------------------------------------------
								Help.Append(THS.Name, RT.Sub, RT.Name, MD, MQ)
							// Define Handler ---------------------------------------------
								switch (typeof(MQ.Proc)) {
									case   'object': Handle = THS.Session(MQ.Proc); break;;
									case 'function': Handle = MQ.Proc; break;;
								};
							// Setup Handler ----------------------------------------------
								THS[RT.Name][MD] = async function Request(...args) { 
									try { return await Handle.apply(THS, args); } 
									catch (err) { throw err; } 
								};
						});
				}); return this;
			}
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Data Handler

	/**
	 * A REST API Object for Database Endpoint Handling & Documentation
	 * @extends {GNRequest}
	 */
	class DBRequest extends GNRequest { 
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of DBRequest.
			 * @param {string} Name The name of the request route
			 * @param {CFG.PNTS.Base<RouteDB>} Configs The configurations for the request route 
			 */
			constructor(Name, Configs) {
				super(Name, Configs); 
				this.Name = Name; 
				/** @type {CLSanitizers} */ this.Sanitzers = {}; 
				/** @type {Object<string,any>} */ this.Defaults = {};
				Help.Create(Name); // Create Documentation
			}

		/// UTILITIES   /////////////////////////////////////////////////////////////////////

			/**
			 * Sanitizes & Formats each Parameter in an Endpoint's clause
			 * @param {string} name The name of this Endpoint
			 * @param {HMETHOD} method The method of this Endpoint
			 * @param {{[paramName:string]:string}} cls An `object literal` of parameter clauses
			 * @param {CLParameters} gnp An `object literal` of `GNParam` instances for each parameter
			 */
			Clause  (name, method, cls, gnp) {
				var THS = this, res = {}, keys = Object.keys(gnp);
				// ----------------------------------------------------------
					keys.map(function (ky, _k) { 
						let prm = ky.toLowerCase(), 
							dfl = THS.Defaults[ky], 
							val = UoN(cls[prm])?dfl:cls[prm], 
							san = THS.Sanitzers[name][method][ky],
							fnl, nil;
						try {
							fnl = san(val); 
							nil = UoN(fnl);
							// cls[prm] = UoN(fnl)?dfl:fnl; 
							cls[prm] = nil?dfl:fnl; 
							res[ky]  = nil?dfl:gnp[ky].Format(cls); 
							/* if (ky == "SvcQUnit") {
								console.log(san)
								console.log(`\n${ky} ------>`, JSON.stringify({ 
									name, method, keys: { ky, prm },
									dfl, text: { val, fnl }, cls
								},null,'  '), "\n")	
							} */
						} catch(e) {
							console.log({ 
								name, method, dfl, ky, prm, val, san 
							}, 	e);	throw e;
						}
					});
				// ----------------------------------------------------------
					/* keys.map(function (ky, _k) {
						let prm = ky.toLowerCase(), 
							dfl = THS.Defaults[ky],
							val = cls[prm];
						res[ky] = (!UoN(val) ? 
							gnp[ky].Format(cls) : 
							dfl);
					}); */
				// ----------------------------------------------------------
					return res;
			}
			/**
			 * Parses a request result for consumption by the client.
			 * @param {CFG.PNTS.Data.Method} RQ A request-method handler.
			 * @param {(TPQryObject|TPQryObject[])} RT The result of the request.
			 * @param {ROUT.JSN.Query} QY The `query`/`body` of the request.
			 * @returns {(TPQryObject|TPQryObject[])}
			 */
			Parse  	(RQ, RT, QY) {
				try { if (!!RQ.Parse) {
						var THS = { ...this, RQ:RQ, QY:QY };
						return RQ.Parse.bind(THS)(RT); }
					else if (!!eval(QY.single)) return RT[0];
					else return JSN.Objectify(RT, RQ.Key, RQ.Columns, QY);
				} catch (e) { console.log(e); console.trace(); return {}; }
			}
			/**
			 * Builds a full-path of endpoint paths in relation to this request.
			 * @param  {...string} args The strings to use in the path.
			 * @returns {string}
			 */
			Path  	(...args) {
				var itms = [this.NME];
				args.filter(function (ag, a) { return !!ag; })
					.map(function (it) {
						if (!it instanceof Array) itms.push(it);
						else itms = itms.concat(it);
					});
				return TLS.Path(itms);
			}
			/**
			 * Builds a `SQL` casting function to convert row values to determined types for a request method handler.
			 * @param {CFG.PNTS.Data.Method} RQ A request-method handler.
			 * @returns {MySQL.TypeCast}
			 */
			Cast  	(RQ) {
				return 	RQ.hasOwnProperty('Cast') ? function (field, next) {
							RQ.Cast(field); return SQL.TYPE(field, next)
						} : SQL.TYPE;
			}
			/**
			 * Takes a request `query`/`body` and converts any `;`-separated lists into `Arrays`.
			 * @param {{[paramName:string]:string}} cls The request clause.
			 * @returns {{[paramName:string]:string|string[]}}
			 */
			Opts  	(cls) {
				return JSN.MapEdit(cls, (val=>val.split(';'))); 
			}

		/// INITIALIZER /////////////////////////////////////////////////////////////////////

			/**
			 * Initializes all Data-Endpoints
			 * @returns {DBRequest}
			 */
			Init  () {
				var THS   = this, alp = 'Aliases', dirty = (v)=>(v), 
					afltr = (v)=>(!!v[alp]&&!!v[alp].length),
					afltr = (v)=>(!!v[alp]&&!!v[alp].length),
					DocH  = Imm.Map(Help.Defaults.Headers),
					DocP  = Imm.Map(Help.Defaults.Params),
					PWH   = { 'Header': DocH, 'Param': DocP },
					AWH   = { 
						'Header' : DocH.filter(afltr), 
						'Param'  : DocP.filter(afltr), 
					};
				// Default Param Handlers -----------------------------------------------------------------------
					/**
					 * ...
					 * @param {string} full 
					 * @param {TPParamMode} kind 
					 * @param {string} name 
					 * @param {Error} error 
					 */	
					function ErrParam(full, kind, name, error) {
						let msg = `${full} :: [${kind}] ${name} | ${error.message}`;
						error.message = msg; throw error;
					}
					/**
					 * ...
					 * @param {TPParamMode} kind 
					 * @returns {(name: string)=>string}
					 */
					function GetParamAliasFactory(kind) { 
						let ali = AWH[kind];
						return function GetParamAlias(name) {
							return ali.filter((v)=>(v[alp].has(name)));
						};
					}
					/**
					 * ...
					 * @param {TPParamMode} kind 
					 * @returns {(name: string)=>boolean}
					 * @throws {Error}
					 */
					function ChkParamFactory(kind) { 
						let doc = PWH[kind], GetAlias = GetParamAliasFactory(kind);
						return function ChkParam(full, name) { 
							try { return doc.has(name) || (GetAlias(name).size==1); } 
							catch (e) { ErrParam(full, kind, name, e); }
						};
					}
					/**
					 * ...
					 * @param {TPParamMode} kind 
					 * @returns {(name: string)=>GNParam}
					 * @throws {Error}
					 */
					function GetParamFactory(kind) { 
						let doc = PWH[kind], GetAlias = GetParamAliasFactory(kind);
						return function GetParam(full, name) { 
							try { return doc.get(name) || GetAlias(name).toArray()[0]; } 
							catch (e) { ErrParam(full, kind, name, e); }
						};
					}
				// Query Handlers -------------------------------------------------------------------------------
					/**
					 * ...
					 * @param {CFG.PNTS.Data.Method} RQ The Request Method Handler
					 * 
					 */
					function FNQueryFactory(RQ) {
						return async function FNQuery(cls, onTimer, onSuccess, onFailure) {
							try { 
								let Q = RQ.Query, F = `FNC = ${Q}`, FNC; 
								LG.IF(`\n${Q}\n`); eval(F); FNC = FNC.bind(THS.Utils); 
								onTimer(); return onSuccess(...(await FNC(cls())));
							} catch (err) { 
								console.log(err.stack)
								return onFailure('Backend')(err); 
							}
						};
					};
					/**
					 * ...
					 * @param {CFG.PNTS.Data.Method} RQ The Request Method Handler
					 * 
					 */
					function DBQueryFactory(RQ) {
						return async function DBQuery(cls, onTimer, onSuccess, onFailure) {
							try { 
								// Acquire a Pool Connection
								let sql = SQL.FORMAT(RQ.Query, cls(), Points),
									con = await CONN.acquire(); 
								onTimer(); // Timer Stats
								// Execute the Query
								let { error, results } = await con.query({ 
									sql, typeCast: THS.Cast(RQ) 
								}); return onSuccess(error, results);
							} catch (err) { 
								console.trace(err)
								return onFailure('Database')(err); 
							}
						};
					}
				// Subscribe Requests ---------------------------------------------------------------------------
					THS.Requests.map(
						/**
						 * @param {RouteDB} RT The `RouteDB` instance of the Endpoint
						 */
						function (RT) {
							// Setup Default Query; Route Paths -------------------------------------------------
							let Parents = THS.Path(!!RT.Sub?RT.Sub:[]),
								Full = `${Parents}/${RT.Name.toLowerCase()}`.replace(/\/+$/,'');
								THS[RT.Name] = {}; THS.Sanitzers[Full] = {};
							// Initialize Methods ---------------------------------------------------------------
							RT.Methods.map(M=>[M,RT[M]]).filter(M=>!!M[1]).map(
								/**
								 * ...
								 * @param {[HMETHOD,import('dffrnt.confs').QueryGN<CBRouteDB>]} MT 
								 */
								MT => {
									let MD = MT[0], MQ = MT[1], Defq = {}, RUN;
									// Handler for Mapping Header/Param Referencs -----------------------------------
										/**
										 * ...
										 * @param {('Header'|'Param')} kind ...
										 * @returns {(P:GNParam,N:string)=>void}
										 */
										function MapParamsFactory(kind) {
											let ChkParam = ChkParamFactory(kind),
												GetParam = GetParamFactory(kind),
												SetParam = {
													/** @type {CBSetParam} */
													'Header' : (MQ,N,V)=>(MQ.Doc.Headers[N]=V,V),
													/** @type {CBSetParam} */
													'Param'  : (MQ,N,V)=>(MQ.Params[N]=V,V),
												}[kind];
											return function MapParams(P, N) {
												// --------------------------------------------------------------------------
													if (ChkParam(Full, N)) {
														let D = GetParam(Full, N), A = ISS(P)=='array', V;
														// ------------------------------------------------------------------
														if ([true,null].has(P) || A) {
															// V = Assign({},D);
															V = D;
															// Setting NULL implies using raw value
															if (P===null) { V.Format=(cls)=>(cls[N.toLowerCase()]); };
															// Setting ["{{VERSION}}"] implies using a specified Formatter
															if (A) { V = D.Version[P[0]]; };
															// Use the Default Config
															P = SetParam(MQ,N,V);
														};
													} else {
														console.log(`>> >> >> ${Full} :: ${N}`)
													};
												// --------------------------------------------------------------------------
													try {
														/** @type {PType} */
														let T = P.Desc.type;
														if (CNAME(T)=='PType') {
															THS.Sanitzers[Full][MD][N] = P.Desc.type.sanitize;
														} else {
															THS.Sanitzers[Full][MD][N] = dirty;
														};
													} catch (e) { ErrParam(Full, kind, N, e); }
											};
										}
									// Insert Referenced Header/Param Objects ---------------------------------------
										THS.Sanitzers[Full][MD] = {}
										Imm.OrderedMap(MQ.Doc.Headers).map(MapParamsFactory('Header'));
										Imm.OrderedMap(MQ.Params).map(MapParamsFactory('Param'));
									// Setup Default Param Values ---------------------------------------------------
										Imm.OrderedMap(MQ.Params).map((v,k,i) => {
											if (v.Desc.to==='query' && v.hasOwnProperty('Default'))
												Defq[k.toLowerCase()] = v.Default;
												THS.Defaults[k] = v.Default;
										});
									// Finalize the Instance; Create Help-Doc ---------------------------------------
										MQ.Lock(); Help.Append(THS.Name, RT.Sub, RT.Name, MD, MQ); 
										RUN = (MQ.QisFunction ? FNQueryFactory(MQ) : DBQueryFactory(MQ));
									// Request Handler --------------------------------------------------------------
									/**
									 * ...
									 * @param {ExRequest} req 
									 */
									THS[RT.Name][MD] = async function (req) {
										let rTM = THS.TimerStart(), rEN, qTM, qEN, cTM,
											bTM = THS.TimerStart(), bEN, aTM, aEN, cEN,
											prm = TLS.Fill(req.params, JSN.MapWith(MQ.Clause, 'Default')),
											qry = { ...Defq, ...req.body, ...req.query }, pth = Parents,
											cls = ()=>THS.Clause(Full, MD, {...prm,...qry}, MQ.Params);
										// ------------------------------------------------------
										let onSuccess = function (rer, ret) {
												qEN = THS.TimerEnd(qTM); aTM = THS.TimerStart();
												MQ.links = {}; 
												let sts, sss, err, emg, 
													T = 'OkPacket', R = 'RowDataPacket', A = 'Array',
													mapr = (v)=>(!TYPE(v,A) ? addr(v) : v.map(mapr)),
													addr = (v)=>(vls=vls.concat(Assign({},v))), 
													itms = {}, opts = {}, vls = []; 
												// Format Response Results
													try { switch (true) {
														case 	 !!!ret: 	vls = []; break;
														case 	  !!rer: 	err = {
																				code: 	  rer.code,
																				errno: 	  rer.errno,
																				sqlState: rer.sqlState,
																				index: 	  rer.index
																			}; emg = rer.sqlMessage;
																			LG.IF('ERROR:',emg,'\n'); 
																			break;
														case  	  !!ret: 	sss = ret.filter(v=>TYPE(v,T));		
														case sss.length: 	sts = Imm.Map(sss[0]);
																			sss.slice(1).map(v=>{
																				sts = sts.mergeWith((p,n)=>{
																					return (TYPE(p,A)?p:[p]).concat([n])
																				}, Imm.Map(v))
																			}); 
																			(sts.size) && LG.IF('STATUS:',sts.toJS(),'\n');
																			ret	.filter(v=>!TYPE(v,T))
																				.map(mapr); 
																			break;
														};	itms = THS.Parse(MQ, vls, qry); 
													} catch (e) { console.log(e); }
												// Configure Query Options
													try { opts = JSN.Optify(
														Imm.Map(qry).filter(v=>v!='').toObject(), 
														itms, pth, THS.Opts(prm), MQ.links
													); } catch (e) { console.log(e); console.trace(); }
												// Configure Pagination
													opts.Links.prev = SQL.SOCKET({ link: opts.Links.prev });
													opts.Links.next = SQL.SOCKET({ link: opts.Links.next });
												// Configure Timing
													aEN = THS.TimerEnd(aTM); rEN = THS.TimerEnd(rTM);
													opts.Options.time = {
														pre: 	 `${(bEN/1000).toFixed(3)} s`,
														conn: 	 `${(cEN/1000).toFixed(3)} s`,
														query: 	 `${(qEN/1000).toFixed(3)} s`, 
														post: 	 `${(aEN/1000).toFixed(3)} s`,
														request: `${(rEN/1000).toFixed(3)} s`
													};
													// LG.Server(
														// req.originalUrl, 
														// 'ROUTE', 
														// JSN.Pretty(opts.Options.time), 
														// 'magenta'
													// );
												// Send to WebSocket or XHR
													return [ err, itms, opts ];
											};
										let onFailure = function (ident) {
												// Something fails before Query executes
												return err => { 
													LG.Error(err.message, ident, 'GET');
													throw [ MSG.ERROR, err.message, '', qry ];
												};
											};
										let onTimer   = function () {
												cEN = THS.TimerEnd(cTM); 
												qTM = THS.TimerStart();
											}; 
										// ---------------------------------------------
										bEN = THS.TimerEnd(bTM); cTM = THS.TimerStart();
										// Determine if Database is needed or not
										return await RUN(cls, onTimer, onSuccess, onFailure);
									};
							});
					}); 
				// Return Instance for Chaining -------------------------------------------------------------
					return this;
			}
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Remote Handler

	/**
	 * A Request Object for Remote **REST APIs** using the `dffrnt`.`api` Framework
	 */
	class Remote { 
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////
			
			/**
			 * Creates an instance of Remote.
			 * @param {string[]} [services=[]] The Socket URL for the remote API 
			 */
			constructor(services = []) {
				let THS = this, sIOc = require('socket.io-client'); 
				THS.Points = {};
				THS.ON = (resolve, reject) => (function ON(ret) {
					let opts = ret.payload.options,
						whch = (!!opts.query?'query':'body'),
						stat = ret.status==200;
					try { 
						delete opts[whch].reqid; 
						delete opts[whch].to; 
						delete opts[whch].at; 
					} catch(e){}
					return (stat?resolve(ret):reject(ret));
				});
				THS.IO = services.map((u,i) => (
					LG.Server(u, 'SOCKET', 'Engaged', 'blue'),
					sIOc(u)
						.removeAllListeners()
						.on('points', points => (
							points.map(p=>(THS.Points[p]=i)),
							LG.Server(u, 'ENDPOINTS', 'Exposed', 'blue')
					)	)	)	);
			}
		
		/// PROPERTIES  /////////////////////////////////////////////////////////////////////

			/**
			 * The collection of allowed HTTP `methods`
			 *
			 * @type {string[]}
			 * @readonly
			 * @memberof Remote
			 */
			get Methods	( ) {
				return ['GET','PUT','POST','DELETE','MIDDLEWARE']; 	
			}
			/**
			 * A mapping of `prop` names to their respective HTTP `method`
			 *
			 * @type {METHOD_MAP}
			 * @readonly
			 * @memberof Remote
			 */
			get Which  	( ) {
				return METHOD_MAP; 
			}

		/// PRIVATES    /////////////////////////////////////////////////////////////////////
			
			/**
			 * A mixin for default `body`/`query` options.
			 *
			 * @param {string} rid The Request ID.
			 * @param {string} [point=''] The endpoint for the request.
			 * @param {HMETHOD} [method='GET'] The method for the request.
			 * @param {ROUT.JSN.Body} [props={}] The request `params`.
			 * @returns {ROUT.JSN.Body} A mixed-in `ROUT.JSN.Body` object to pass to the request.
			 * @memberof Remote
			 * @private
			 */
			_defaults(rid, point = '', method = 'GET', props = {}) {
				let which = this.Which[method],
					merge = { [which]: {
						reqid: 	rid,
						single: false,
						page:   1,
						limit:  10,
						at:   ['payload'],
						to:   ['payload'],
						path:   point,
					 ...props[which] } };
				return { ...props, ...merge };
			}

			/**
			 * Remove the listen of the last completed Request.
			 *
			 * @param {string} rid The Request ID.
			 * @param {CBRemote} callback The callback that handled the last Request.
			 * @memberof Remote
			 * @private
			 */
			_clean(rid, callback) {
				this.IO.off(rid,callback)
			}

			/**
			 * Checks if the `HMETHOD` is valid.
			 *
			 * @param {HMETHOD} [method='GET'] The method for the request.
			 * @memberof Remote
			 * @private
			 */
			_valid(method = 'GET') {
				return this.Methods.has(method.toUpperCase());
			}

			/**
			 * Executes all `Remote` DB reuests.
			 *
			 * @param {string} [point=''] The endpoint for the request.
			 * @param {HMETHOD} [method='GET'] The method for the request.
			 * @param {ROUT.JSN.Paths} [params={}] The request `params`.
			 * @param {ROUT.JSN.Body} [props={}]  The `body`, `files`, and/or `query` options of the request.
			 * @memberof Remote
			 * @private
			 */
			async _requests(point = '', method = 'GET', params = {}, props = {}, misc = {}) {
				let THS = this; if (!THS._valid(method)) return;
				return new Promise((resolve, reject) => {
					let RID = Remote.newID(),
						SCK = THS.IO[THS.Points[point]],
						def = THS._defaults(RID, point, method, props),
						req = {...misc,method,params:params||{},...def};
					if (!!!SCK) {
						console.error('\nREMOTE ERROR:\n',THS.Points,point,params,props,'\n');
						reject({ message: 'Endpoint does not Exist.' });
					};	SCK.on(RID, THS.ON(resolve,reject)); SCK.emit(point, req);
				}	);
			}

		/// PROCEDURES  /////////////////////////////////////////////////////////////////////

			/**
			 * Performs a Remote `MIDDLEWARE` Request.
			 *
			 * @param {string} [point=''] The endpoint for the request.
			 * @param {ROUT.JSN.Paths}  [params={}] The request `params`.
			 * @param {ROUT.JSN.Body} [query={}]  The `query` options of the request.
			 * @param {{}} [misc={}]  Any miscellaneous options for the request.
			 * @memberof Remote
			 */
			MID (point = '', params = {}, body = {}, misc = {}) {
				return this._requests(point, 'MIDDLEWARE', params, { body: body }, misc);
			}
			/**
			 * Performs a Remote `GET` Request
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ROUT.JSN.Paths}  [params={}] The request `params`
			 * @param {ROUT.JSN.Body} [query={}]  The `query` options of the request
			 * @param {{}} [misc={}]  Any miscellaneous options for the request
			 * @memberof Remote
			 */
			GET (point = '', params = {}, query = {}, misc = {}) {
				return this._requests(point, 'GET', params, { query: query }, misc);
			}
			/**
			 * Performs a Remote `PUT` Request
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ROUT.JSN.Paths}  [params={}] The request `params`
			 * @param {ROUT.JSN.Body} [body={}]   The `body` of the request
			 * @param {ReqFiles}   [files=[]]  A possible list of `File` objects
			 * @param {{}} [misc={}]  Any miscellaneous options for the request
			 * @memberof Remote
			 */
			PUT (point = '', params = {}, body  = {}, files = [], misc = {}) {
				return this._requests(point, 'PUT', params, { body: body, files: files }, misc);
			}
			/**
			 * Performs a Remote `POST` Request
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ROUT.JSN.Paths}  [params={}] The request `params`
			 * @param {ROUT.JSN.Body} [body={}]   The `body` of the request
			 * @param {{}} [misc={}]  Any miscellaneous options for the request
			 * @memberof Remote
			 */
			POST(point = '', params = {}, body  = {}, misc = {}) {
				return this._requests(point, 'POST', params, { body: body }, misc);
			}
			/**
			 * Performs a Remote `DELETE` Request
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ROUT.JSN.Paths} [params={}] The request `params`
			 * @param {{}} [misc={}]  Any miscellaneous options for the request
			 * @memberof Remote
			 */
			DEL (point = '', params = {}, misc = {}) {
				return this._requests(point, 'DELETE', params, { body: body }, misc);
			}
		
		/// STATIC      /////////////////////////////////////////////////////////////////////

			/**
			 * Gets a new Callback ID
			 *
			 * @static
			 * @returns {string} A new Callback ID
			 * @memberof Remote
			 */
			static newID() {
				let R = MD5(((new Date())*Math.random()).toString(36))
				return R;
			}
			
			/**
			 * Saves a _new_ client `session`.
			 * @param {ExRequest} req The client `request` object.
			 * @param {CLSessData} data A plain-object of `meta-data` to **save** with the `session`.
			 */
			static Save 		(req, data = {}) {
				let sess = req.session;
				sess.user = Assign(sess.user, data||{});
				sess.touch(); sess.save();
			}
			/**
			 * Renews a client's _near-expired_ `session`.
			 * @param {ExRequest} req The client `request` object.
			 * @param {CLSessData} data A plain-object of `meta-data` to **save** with the `session`.
			 */
			static Renew  	  	(req, data = {}) {
				var SESS = Session, SS = req.session, EX = SS.cookie.maxAge;
				if ( EX / SESS.Age.In <= 0.20 ) this.Save(req, data);
			}
			/**
			 * Regenerates a client's _current_ `session`.
			 * @param {ExRequest} req The client `request` object.
			 */
			static Regenerate 	(req) {
				return new Promise((resolve, reject) => {
					let sid  = req.sessionID,
						user = req.user,
						body = req.body,
						acct = user.acct;
					req.session.regenerate(err => {
						LG.Server(sid, 'Regenerated', acct, 'red');
						if (!!err) reject(err);
						else resolve([
							MSG.RESTORED.temp, 
							user, null, body
						]);
					});
				})
			}
			/**
			 * Destroys a client's `session`.
			 * @param {ExRequest} req The client `request` object.
			 */
			static Destroy 		(req) {
				delete req.session.user; 
				req.session.save();
			}
			/**
			 * Removes _senstive-data_ from a client's `session`.
			 * @param {ExRequest} req A client `request` object to sanitize.
			 */
			static Santitize 	(req) {
				delete req.body.username; 
				delete req.body.password;
				delete req.session.user.Scopes.user_pass;
			}

	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Overall Handler

	/**
	 * The REST API Object Factory
	 */
	class RESTFactory { 
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of RESTFactory.
			 */
			constructor() {}

		/// PROPERTIES //////////////////////////////////////////////////////////////////////

			/**
			 * Auth/Endpoint Configs.
			 *
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Config ( ) { return Config;  }
			/**
			 * Auth/Endpoint Handlers.
			 *
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Points ( ) { return Points;  }
			/**
			 * Auth/Endpoint Documentation.
			 *
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Help   ( ) { return Help;    }
			/**
			 * Auth/Endpoint Remote-Caller.
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Remote ( ) { return _Remote; }

		/// UTILITIES ///////////////////////////////////////////////////////////////////////

			/**
			 * Binds the Auth/Enpoint Configs to the REST environment
			 *
			 * @param {()=>(CFG.AuthPoints|CFG.DataPoints)} func An Authpoint or Endpoint config function
			 * @returns {(CFG.AuthPoints|CFG.DataPoints)} A binded Auth/Enpoint Configs object
			 * @memberof RESTFactory
			 */
			BINDER (func) {
				var ST = func.toString(),
					AU = !!ST.match(/:\s+new\s+RouteAU\(/),
					RX = /^function \(\) \{([\S\s]+)\};?$/,
					AG = Imm.OrderedMap({
						SQL, AMP, ORS, PIP, UER, MSG, PRM, Docs: Help.Defaults, 
						LG, TLS, JSN, Imm, TZ, TYPE, Assign, UoN, CNAME, 
						RouteAU, RouteDB, GNHeaders, GNParam, GNDescr, 
						PType, PT, _Methods, Points, Plugins, Stores, Alert, 
						...(AU ? {
							STATE, Sessions: Session.Group,
						} : {})
					}),
					FN = new Function(
						...AG.keySeq().toArray(),
						ST.match(RX)[1]
					);
				return FN(...AG.valueSeq().toArray());
			}

		/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

			/**
			 * Registers instances of `GNRequest`
			 *
			 * @param {string} name The name of the request route
			 * @param {CFG.PNTS.Base} configs The configurations for the request route 
			 * @memberof RESTFactory
			 */
			GNRequest(name,configs) { Points[name] = new GNRequest(name, configs); }
			/**
			 * Registers instances of `AURequest`
			 *
			 * @param {string} name The name of the request route
			 * @param {CFG.PNTS.Auth.Base} configs The configurations for the request route 
			 * @memberof RESTFactory
			 */
			AURequest(name,configs) { Points[name] = new AURequest(name, configs); }
			/**
			 * Registers instances of `DBRequest`
			 *
			 * @param {string} name The name of the request route
			 * @param {CFG.PNTS.Auth.Base} configs The configurations for the request route 
			 * @memberof RESTFactory
			 */
			DBRequest(name,configs) { Points[name] = new DBRequest(name, configs); }
			/**
			 * Reflects the API-Doc route in the API-Documentation.
			 * @param {string} name The name of the documentation route.
			 */
			HPRequest(name) { Help.Finalize(name); }
			/**
			 * Registers the instance of the `Remote` for global use
			 *
			 * @memberof RESTFactory
			 */
			RMRequest() { let CL = Session.CL; !!CL && (_Remote = new Remote(CL)); }

			/**
			 * Initializes the `API Server`, `API Client`, or both
			 *
			 * @param {SESS.App} session A `dffrnt`.`route`.`Session` instance
			 * @memberof RESTFactory
			 */
			Init(session) { 
				let THS = this, BNDR = THS.BINDER; 
				// ----------------------------------------------------------------------- //
					Session = session; 
					Plugins = Session.Plugins; 
					Stores  = Imm.Map(Session.Stores).filter(
						(_s,n) => (!NoStores.has(n))
					).toJS();
					Alert   = Session.Alert;
				// ----------------------------------------------------------------------- //
					Config.AuthP  = BNDR(AuthP);
					Help.Defaults = Config.AuthP.__DEFAULTS;;
					// ------------------------------------------------------------------- //
					Config.EndP   = BNDR(EndP);
					Help.Defaults = Config.EndP.__DEFAULTS;
				// ----------------------------------------------------------------------- //
					CONN.init(); Session.setSQLConn(CONN); 
			}

			/**
			 * ...
			 */
			Start() {
				let THS = this; 
				THS.RMRequest();
			}
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// TESTING

	// console.log( "***\n%s\n", 
		// SQL.QRY(false).test().join("\n\n***\n")
	// );

	// console.log((
		// 	"\n%s, to the %!{%(k)s;\\n%(v<<Planets>>)s}s!\n" +
		// 	"As well as to; %!{%(k)s. %(v<<Names>>)s|;/ & }s!\n" +
		// 	"Of course, let's not forget our... " +
		// 	"%!{%(k)s;\\n%(v<<Planets>>)s}s!\n" +
		// 	"\n" +
		// 		"%!{%!(v)s%!(k|-/\tAS\t|@C/gray)s|;/,\\n \t|-/SELECT\t}s\n" +
		// 		"%{%!(k|^/U)s\t%!(v<<TABLES>>)s|;/\\n|-/FROM}s\n" +
		// 		"%!{%!(k)s\t%!(v<<CLAUSES>>)s|;/\\n}s" +
		// 		"%!{%!([GROUP BY,ORDER BY])s\t%!(v<<LIST>>)s|;/\\n}s" +
		// 		"%!{%!([LIMIT,OFFSET])s\t%!(v)s|;/\\n}s" +
		// 		"\n"
		// ).format(
		// 	'hello', { 
		// 		stuff: [
		// 			'world', 'moon', 'stars'
		// 		]
		// 	}, {
		// 		Mr:  { first: 'Arian', 	  middle: 'LeShaun',   last: 'Johnson' },
		// 		Ms:  { first: 'LindyAnn', middle: 'Christina', last: 'Ephraim' },
		// 	}, {
		// 		planets: [
		// 			'Mercury', 'Venus', 'Mars', 'Saturn',
		// 			'Jupiter', 'Uranus', 'Neptune', 'Pluto'
		// 		]
		// 	}, new FRMT({
		// 		'Stuff': 	"%[%s|;/, \\n|&/ & \\n]s",
		// 		'Names': 	"%(first)s %(middle)s %(last)s",
		// 		'Planets': 	"%[%s|;/, \\n|&/ & \\n]s",
		// 	}, [])
		// )
	// );

/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = new RESTFactory();


/////////////////////////////////////////////////////////////////////////////////////////////

