
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  	{ Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
			  ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
			  ISS, OF, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
			  preARGS, Dbg, LG, TLS, JSN
			} 					   = require('dffrnt.utils');
	const  	{ AuthP, EndP 		 } = require('dffrnt.confs');
	const  	{ UER,   MSG,   PRM  } = require('./errors');
	const  	{ SQL, Connection    } = require('dffrnt.model');
	const  	  Helper 			   = require('./help');
	const  	  TZ 				   = require('tzdata'); // !?!?!?!?!?!?!?!?
	const  	  MD5 				   = require('md5');

	let Help 		= new Helper({ Params: {
			Page:  { Format: cls => SQL.OFFSET((parseInt(cls.page||0)-1)*parseInt(cls.limit)) },
			Limit: { Format: cls => SQL.LIMIT(parseInt(cls.limit)) },
		}	}),
		Defaults    = Help.Defaults,
		Session 	= null, AMP = '+', ORS = ';', PIP = '|',
		Points 		= {}, Config = {}, _Remote = null,
		CONN 		= new Connection();

	/**
	 * The `method` of the `Remote` request
	 * @typedef {'GET'|'PUT'|'POST'|'DELETE'} ReqMethod
	 */	

	/**
	 * The `params` for the `Remote` request
	 * @typedef {{[param:string]:*}} ReqParams
	 */	

	/**
	 * The `body` or `query` options for the `Remote` request
	 * @typedef {{[name:string]:*}} ReqOptions
	 */

	/**
	 * A list of `File` objects for a `Remote` request
	 * @typedef {File[]} ReqFiles
	 */

	/**
	 * The `body`, `files`, and/or `query` options for the `Remote` request
	 * @typedef {object} ReqProps
	 * @property {ReqParams} [params={}] The `params` for the `Remote` request
	 * @property {ReqParams} [query={}]  The `query` for the `Remote` request
	 * @property {ReqParams} [body={}]   The `body` for the `Remote` request
	 * @property {ReqFiles}  [files=[]]  The `files` for the `Remote` request
	 */

	/**
	 * A callback that handles the request response
	 * @typedef {function(object):void} CBRemote
	 */

/////////////////////////////////////////////////////////////////////////////////////////////
// General Handler

	/**
	 * A REST API Interface for Endpoint Handling & Documentation
	 * @class GNRequest
	 */
	class GNRequest {
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of GNRequest.
			 * @param {string} Name The name of the request route
			 * @param {{}} Configs The configurations for the request route 
			 * @memberof GNRequest
			 */
			constructor(Name, Configs) {
				var THS = this; THS.Name = Name; THS._start = Imm.Map({});
				THS.NME = "/"+Name.toLowerCase();
				// Add Endpoints
				THS.Requests = Imm.OrderedMap(Configs)
								  .map((v, k)=>(v.Name=k,v));
			}

		/// ENFORCERS   /////////////////////////////////////////////////////////////////////

			/**
			 * Sends an `Error` response to the Client
			 *
			 * @param {Request} req The Client `HTTP` `Request` instance
			 * @param {Response} res The Server `HTTP` `Response` instance
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
			 * @param {Request} req The Client `HTTP` `Request` instance
			 * @param {Response} res The Server `HTTP` `Response` instance
			 * @memberof GNRequest
			 */
			Limit	(req, res) {
				let THS = this, sess = req.session||{};
				req.query.path = req.query.id; this.ER(
					res, MSG.RATELIMIT, { sessionID: req.sessionID }, 
					((sess.user||{}).acct||''), req.query
				)
			}

		/// DISTIBUTORS /////////////////////////////////////////////////////////////////////

			/**
			 * Renders a message specific to a `User` account via a provided template
			 *
			 * @param {string} msg A `sprintf`-style string template
			 * @param {string} acct A username, email, etc.
			 * @returns {string} A formatted message directed to a specific `User`
			 * @memberof GNRequest
			 */
			MS  	(msg, acct) { return msg.replace(/%s/g, acct); }
			/**
			 * Sends a User-Info Server Response to a Client (`HTTP` or `Socket`)
			 *
			 * @param {Response} res An `HTTP` or `Socket` instance
			 * @param {string} msg A message regarding the response
			 * @param {object} usr The user-info object
			 * @param {string} acct A username, email, etc.
			 * @param {ReqOptions} qry The `query` object from the request
			 * @param {number} cde The payload status code (_this is **NOT** the `HTTP` status_)
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
			 * @param {Response} res An `HTTP` or `Socket` instance
			 * @param {object} pay The "payload" object to send to the Client
			 * @param {ReqProps} opts The "options" object, which includes the `params`, `query`, `body`, etc.
			 * @param {number} status The `HTTP` status code
			 * @memberof GNRequest
			 */
			SN  	(res, pay, opts, status) {
				var stat = (status || 200), link = opts.Links,
					rtrn = JSN.Valid(pay, opts.Options, link, stat);
				res.status(stat).send(rtrn.payload);
			}
			/**
			 * Sends an Error Response to a Client (`HTTP` or `Socket`)
			 *
			 * @param {Response} res An `HTTP` or `Socket` instance
			 * @param {object} hnd The appropriate Error Response handler
			 * @param {Error} err The `Error` instance
			 * @param {string} acct A username, email, etc.
			 * @param {ReqOptions} qry The `query` object from the request
			 * @param {boolean} all If `true`, send to all subscribers
			 * @param {boolean} noSend If `true`, do **NOT** send, just return the result
			 * @returns {object} If `noSend` is `true`, this result object is returned
			 * @memberof GNRequest
			 */
			ER  	(res, hnd, err, acct, qry, all, noSend) {
				var msgs = this.MS(hnd.temp, acct), stat = (hnd.status||500),
					payd = { message: JSN.Error(msgs, err), error: err },
					opts = { query: Assign({}, { path: '/auth/logout' }, qry||{}) },
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
			TimerHash  (    ) { return Math.random().toString(36).substring(7); }
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
	 * @class AURequest
	 * @extends {GNRequest}
	 */
	class AURequest extends GNRequest {
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of AURequest.
			 * @param {string} Name The name of the request route
			 * @param {{}} Configs The configurations for the request route 
			 * @memberof AURequest
			 */
			constructor(Name, Configs) {
				super(Name, Configs); this.ALL = this.NME;
				// Create Documentation
				Help.Create(Name);
				this.Requests.map((RQ, R) => Help.Append(Name, RQ));
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
			Scopes 	 (user) {
				var flt = function (mem, m) { return mem.match(/Groups/); },
					map = function (mem, m) { return mem.split(/,?[A-Z]+\=/).slice(1,-1).reverse(); };
				return TLS.Tree(user.memberOf.filter(flt).map(map), "&");
			}
			Photo  	 (user) {
				var ph = user.thumbnailPhoto;
				return !!ph ? { Photo: 'data:image\/gif;base64,'+ph.toString('base64') } : {};
			}
			Boss  	 (manager) {
				var name = manager.split(/,?[A-Z]+\=/)[1].split(' '),
					acct = (name[0].split('')[0]+name[1]).toLowerCase(),
					pnts = '/users/:account:', qry = '?kind=ext';
				return { name: name, link: SQL.SOCKET({ link: pnts+acct+qry }) }
			}
			Format   (row) {
				var user = Assign({},row), frmt = Session.Auth.Format,
					profile = {}, prfleLst, account, 
					scopes  = {}, scopeLst;
				if (!!!frmt) return user; //
				account = ( //
					(!!!frmt.Account) ?
					user[Object.keys(user)[0]] :
					user[frmt.Account]
				);
				prfleLst = frmt.Profile;
				if (!!!prfleLst||prfleLst=="*") profile = user; 
				else prfleLst.map(k=>{profile[k]=user[k];});
				//
				scopeLst = (frmt.Scopes||[]);
				scopeLst.map(k=>{scopes[k]=user[k];});
				return {
					Account: account,
					Profile: profile,
					Scopes:  scopes
				};
			}
			Parse  	 (user) { return !!user ? JSON.parse(user) : {}; }
			Change   (older, newer) {
				try { return Imm.fromJS(older).equals(Imm.fromJS(newer)) === false; }
				catch (err) { return true; }
			}

		/// FUNCTIONS   /////////////////////////////////////////////////////////////////////

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
			Tokenize  		(user) {
				var THS = this, acct = user.Account, scopes = user.Scopes, 
					payload = Assign({}, {
						iat: new Date().getUTCSeconds(), ver: "1.0.0", user: acct, scope: scopes,
						// "iss": os.hostname(), "aud": "World",
					});
				return new Promise((resolve, reject) => {
					THS.Token.encode( THS.Cookie.Secret, payload, function (err, token) {
						if (err) {
							LG.Error( ' {....} ', 'Token', TLS.Concat(err.name, err.message));
							reject({});
						} else {
							LG.Server(' {....} ', 'Token', acct, 'magenta');
							THS.Users.set(acct, token); 
							resolve(token);
						}
					});
				});
			}
			async Grant 	(user, withToken) {
				var THS = this, acct = user.Account, token, scope,
					done = function (token) {
						if (!!withToken) { user.Token = token; }; 
						return user;
					};

				try { 
					token = await new Promise((resolve, reject) => {
						THS.Users.get(acct, function (error, token) {
							!!error && reject(error) || resolve(token)
						});
					}); 
				} catch (err) { return err; }

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
			async Profile   (acct, withToken) {
				let THS = this, erQ = { path: '/error' }, rer, ret;
				try {
					let con = await CONN.acquire();
					({ rer, ret } = await con.query({
						sql: THS.Script.Profile,
						typeCast: SQL.TYPE
					}, 	[acct]));
				} catch(err) {
					LG.Error(err.message, 'Database', 'GET');
					return {};
				}
				try {	
					switch (true) {
						case  !!rer: throw [MSG.ERROR,  rer, acct, erQ];
						case !!!ret: throw [MSG.EXISTS, UER, acct, erQ];
						default: return await THS.Grant(THS.Format(ret[0]), withToken);
					}
				} catch(err) { return err; }
			}

			Session   		(config) {
				var THS = this; 
				return async (req, res, next) => {
					// console.log('AUTH.Session():', req)
					var sess = req.session, sid = req.sessionID,
						Pick = function Pick (which, obj) {
							var handle = config[which];
							switch (typeof(handle)) {
								case 'string': 
									if (!!next) return next(); 
									throw [MSG[handle], obj, null, req.body]; 
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

			Init  () {
				var THS = this;
				THS.Requests.map(function (RQ, R) {
					THS[RQ.Name] = async function Request(...args) { try {
						switch (typeof(RQ.Proc)) {
							case   'object': return await THS.Session(RQ.Proc).apply(THS, args);
							case 'function': return await RQ.Proc.apply(THS, args);
						};
					} catch (err) { throw err; } }
				}); return this;
			}
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Data Handler

	/**
	 * A REST API Object for Database Endpoint Handling & Documentation
	 * @class DBRequest
	 * @extends {GNRequest}
	 */
	class DBRequest extends GNRequest {
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of DBRequest.
			 * @param {string} Name The name of the request route
			 * @param {{}} Configs The configurations for the request route 
			 * @memberof DBRequest
			 */
			constructor(Name, Configs) {
				super(Name, Configs); this.Name = Name;
				Help.Create(Name); // Create Documentation
			}

		/// UTILITIES   /////////////////////////////////////////////////////////////////////

			Clause  (cls, fnc) {
				var res = {}, keys = Object.keys(fnc);
				keys.map(function (ky, k) {
					res[ky] = fnc[ky].Format(cls);
				}); return res;
			}
			Clean   (func) {
				let F = func.toString(), M = /^(?!function)(.+)/, 
					T = F.split("\n").slice(-1)[0].match(/^(\s+|)/)[0],
					G = new RegExp(`^${T}`,'gm'), R = 'function $1';
				return F.replace(M,R).replace(G,'');
			}
			Parse  	(RQ, RT, QY) {
				try { if (!!RQ.Parse) {
						var THS = Assign({}, this, {RQ:RQ,QY:QY}),
							PRS = RQ.Parse.bind(THS); return PRS(RT); }
					else if (!!eval(QY.single)) return RT[0];
					else return JSN.Objectify(RT, RQ.Key, RQ.Columns, QY);
				} catch (e) { console.log(e); console.trace(); return {}; }
			}
			Path  	(...args) {
				var itms = [this.NME];
				args.filter(function (ag, a) { return !!ag; })
					.map(function (it) {
						if (!it instanceof Array) itms.push(it);
						else itms = itms.concat(it);
					});
				return TLS.Path(itms);
			}
			Cast  	(RQ) {
				return 	RQ.hasOwnProperty('Cast') ? function (field, next) {
							RQ.Cast(field); return SQL.TYPE(field, next)
						} : SQL.TYPE;
			}
			Opts  	(cls) { return JSN.MapEdit(cls, (val=>val.split(';'))); }
			SQL   	(RQ) { 
				var R = '', Q = RQ.Query, AAR = ISS(Q)==='array',
					mgx = /^function|[\w\d_]+\s*[(]\s*cls\s*[)]/;
				R = (AAR ? Q.join("\n").replace("\t","") : Q.toString());
				return (!!!R.match(mgx) ? R : this.Clean(R));
			}

		/// INITIALIZER /////////////////////////////////////////////////////////////////////

			Init  () {
				var THS = this;
				THS.Requests.map(function (RQ, R) {
					// Setup Default Query; Route Paths;
						var Defq = {}, Routes = !!RQ.Routes ? RQ.Routes : [], 
							DocP = Defaults.Params;
					// Insert Referenced Param Objects
						Imm.OrderedMap(DocP).map(function (v,k,i) {
							if (RQ.Params.hasOwnProperty(k) && 
								RQ.Params[k]===true) RQ.Params[k] = v;
						});
					// Setup Default Param Values
						Imm.OrderedMap(RQ.Params).map(function (v,k,i) {
							if (v.Desc.to==='query' && v.hasOwnProperty('Default'))
								Defq[k.toLowerCase()] = v.Default;
						});
					// Clean the SQL; Create Help-Doc
						RQ.Query = THS.SQL(RQ); Help.Append(THS.Name, RQ);
					// Request Handler
					THS[RQ.Name] = async function (req) {
						var rTM = THS.TimerStart(), rEN, qTM, qEN, cTM,
							bTM = THS.TimerStart(), bEN, aTM, aEN, cEN,
							prm = TLS.Fill(req.params, JSN.MapWith(RQ.Clause, 'Default')),
							qry = Assign({}, Defq, req.body, req.query),
							opt = THS.Opts(prm), pth = THS.Path(Routes),
							cls = ()=>THS.Clause(Assign({}, prm, qry), RQ.Params),
							onSuccess = function (rer, ret) {
								qEN = THS.TimerEnd(qTM); aTM = THS.TimerStart();
								RQ.links = {}; //!!con && con.release(); // Release connection; if needed
								let sts, sss, err, emg, T = 'OkPacket', vls = [], itms = {}, opts = {}; 
								// Format Response Results
									try { switch (true) {
											case 	 !!!ret: vls = []; break;
											case 	  !!rer: err = {
																code: 	  rer.code,
																errno: 	  rer.errno,
																sqlState: rer.sqlState,
																index: 	  rer.index
															}; emg = rer.sqlMessage;
															LG.IF('ERROR:',emg,'\n'); 
															break;
											case  	  !!ret: sss = ret.filter(v=>TYPE(v,T));		
											case sss.length: sts = Imm.Map(sss[0]);
																sss.slice(1).map(v=>{
																	sts = sts.mergeWith((p,n)=>{
																		return (TYPE(p,'Array')?p:[p]).concat([n])
																	}, Imm.Map(v))
																}); sts = sts.toJS();
																LG.IF('STATUS:',sts,'\n');
																ret.filter(v=>!TYPE(v,T))
																   .map(v=>{vls=vls.concat(Assign({},v))}); 
																break;
										};	
										itms = THS.Parse(RQ, vls, qry); 
									} catch (e) { console.log(e); }
								// Configure Query Options
									try { opts = JSN.Optify(
										Imm.Map(qry).filter(v=>v!='').toObject(), 
										itms, pth, opt, RQ.links
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
									}
								// Send to WebSocket or XHR
									return [ err, itms, opts ];
							},
							onFailure = function (ident) {
								// Something fails before Query executes
								return err => ( 
									LG.Error(err.message, ident, 'GET'),
									[ req.originalUrl, err.message, 500 ]
								);
							},
							isFunc = !!RQ.Query.match(/^function/);

						bEN = THS.TimerEnd(bTM);
						cTM = THS.TimerStart();

						// Determine if Database is needed or not
						if (isFunc) try {
							cEN = THS.TimerEnd(cTM); qTM = THS.TimerStart();
							let Q = RQ.Query, FNC; LG.IF(`\n${Q}\n`); 
							eval(`FNC = (${Q})`); 
							return onSuccess(...FNC(cls()));
						} catch (err) { 
							return onFailure('Backend')(err); 
						} else try { // Acquire a Pool Connection
							let con = await CONN.acquire(); 
							// Connection Succeeded
							cEN = THS.TimerEnd(cTM); qTM = THS.TimerStart();
							let sql = SQL.FORMAT(RQ.Query, cls(), Points), pgn = SQL.PAGE(qry),
								{ rer, ret } = await con.query({ 
									sql: sql, typeCast: THS.Cast(RQ) 
								});
							return onSuccess(rer, ret);
						} catch (err) { 
							return onFailure('Database')(err); 
						}
					};
				}); return this;
			}
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// Remote Handler

	/**
	 * A Request Object for Remote **REST APIs** using the `dffrnt`.`api` Framework
	 * @class Remote
	 */
	class Remote { 
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////
			
			/**
			 *Creates an instance of Remote.
			 * @param {string[]} [services=[]] The Socket URL for the remote API 
			 * @memberof Remote
			 */
			constructor(services = []) {
				let THS = this, sIOc = require('socket.io-client'); 
				THS.Points = {};
				THS.IO = services.map((u,i) => (
					sIOc(u)
						.removeAllListeners()
						.on('points', points => 
							points.map(p=>(THS.Points[p]=i))
				)	)	);
			}
		
		/// PROPERTIES  /////////////////////////////////////////////////////////////////////

			/**
			 * The collection of allowed HTTP `methods`
			 *
			 * @type {string[]}
			 * @readonly
			 * @memberof Remote
			 */
			get Methods	( ) { return [
				'GET','PUT','POST','DELETE','MIDDLEWARE'
			]; 	}
			/**
			 * A mapping of `prop` names to their respective HTTP `method`
			 *
			 * @type {{[method:string]:prop}}
			 * @readonly
			 * @memberof Remote
			 */
			get Which  	( ) { return {
				GET: 'query', PUT: 'body', POST: 'body',
				DELETE: 'body', MIDDLEWARE: 'body'
			};	}

		/// PRIVATES    /////////////////////////////////////////////////////////////////////
			
			/**
			 * A mixin for default `body`/`query` options
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ReqMethod} [method='GET'] The method for the request
			 * @param {ReqProps} [props={}] The request `params`
			 * @returns {ReqProps} A mixed-in `ReqProps` object to pass to the request
			 * @memberof Remote
			 * @private
			 */
			_defaults(rid, point = '', method = 'GET', props = {}) {
				let which = this.Which[method],
					merge = { [which]: Assign({},{
						reqid: 	rid,
						single: false,
						page:   1,
						limit:  10,
						at:   ['payload'],
						to:   ['payload'],
						path:   point,
					},	props[which]) };
				return Assign({}, props, merge);
			}

			/**
			 * Remove the listen of the last completed Request
			 *
			 * @param {function(...*):void} cb The callback that handled the last Request
			 * @memberof Remote
			 * @private
			 */
			_clean(rid, callback) {
				this.IO.off(rid,callback)
			}

			/**
			 * Checks if the `ReqMethod` is valid
			 *
			 * @param {ReqMethod} [method='GET'] The method for the request
			 * @memberof Remote
			 * @private
			 */
			_valid(method = 'GET') {
				return this.Methods.has(method.toUpperCase());
			}

			/**
			 * Executes all `Remote` DB reuests
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ReqMethod} [method='GET'] The method for the request
			 * @param {ReqParams} [params={}] The request `params`
			 * @param {ReqProps} [props={}]  The `body`, `files`, and/or `query` options of the request
			 * @memberof Remote
			 * @private
			 */
			async _requests(point = '', method = 'GET', params = {}, props = {}, misc = {}) {
				let THS = this; if (!THS._valid(method)) return;
				return new Promise((resolve, reject) => {
					let RID = Remote.newID(),
						SCK = THS.IO[THS.Points[point]],
						rsv = ret => (ret.status==200?resolve(ret):reject(ret)),
						def = THS._defaults(RID, point, method, props),
						req = Assign({},misc,{method:method,params:params||{}},def);
					if (!!!SCK) reject({ message: 'Endpoint does not Exist.' });
					SCK.on(RID, rsv); SCK.emit(point, req);
				}	);
			}

		/// PROCEDURES  /////////////////////////////////////////////////////////////////////

			/**
			 * Performs a Remote `MIDDLEWARE` Request
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ReqParams}  [params={}] The request `params`
			 * @param {ReqOptions} [query={}]  The `query` options of the request
			 * @param {{}} [misc={}]  Any miscellaneous options for the request
			 * @memberof Remote
			 */
			MID (point = '', params = {}, body = {}, misc = {}) {
				return this._requests(point, 'MIDDLEWARE', params, { body: body }, misc);
			}
			/**
			 * Performs a Remote `GET` Request
			 *
			 * @param {string} [point=''] The endpoint for the request
			 * @param {ReqParams}  [params={}] The request `params`
			 * @param {ReqOptions} [query={}]  The `query` options of the request
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
			 * @param {ReqParams}  [params={}] The request `params`
			 * @param {ReqOptions} [body={}]   The `body` of the request
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
			 * @param {ReqParams}  [params={}] The request `params`
			 * @param {ReqOptions} [body={}]   The `body` of the request
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
			 * @param {ReqParams} [params={}] The request `params`
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

			static Save 		(req, data = {}) {
				let sess = req.session;
				sess.user = Assign(sess.user, data||{});
				sess.touch(); sess.save();
			}
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
			static Renew  	  	(req, data = {}) {
				var SESS = Session, SS = req.session, EX = SS.cookie.maxAge;
				if ( EX / SESS.Age.In <= 0.20 ) this.Save(req, data);
			}
			static Destroy 		(req) {
				delete req.session.user; 
				req.session.save();
			}
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
	 * @class REST
	 */
	class RESTFactory {
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			/**
			 * Creates an instance of RESTFactory.
			 * @memberof RESTFactory
			 */
			constructor() {
				Config = { AuthP: this.BINDER(AuthP), EndP: this.BINDER(EndP) };
				Defaults.Params = Assign( {}, Defaults.Params, Config.EndP.__DEFAULTS );
			}

		/// PROPERTIES //////////////////////////////////////////////////////////////////////

			/**
			 * Auth/Endpoint Configs
			 *
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Config ( ) { return Config;  }
			/**
			 * Auth/Endpoint Handlers
			 *
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Points ( ) { return Points;  }
			/**
			 * Auth/Endpoint Documentation
			 *
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Help   ( ) { return Help;    }
			/**
			 *
			 * @type {Remote}
			 * @readonly
			 * @memberof RESTFactory
			 */
			get Remote ( ) { return _Remote; }

		/// UTILITIES ///////////////////////////////////////////////////////////////////////

			/**
			 * Binds the Auth/Enpoint Configs to the REST environment
			 *
			 * @param {Function} func An Authpoint or Endpoint config function
			 * @returns {{}} A binded Auth/Enpoint Configs object
			 * @memberof RESTFactory
			 */
			BINDER (func) {
				var RX = /^function \(\) \{([\S\s]+)\};?$/,
					FN = new Function(
						'SQL','AMP','ORS','PIP','UER','MSG','PRM','Docs','LG','TLS','JSN',
						'Imm','TZ','TYPE','Assign',
						func.toString().match(RX)[1]
					);
				return FN(
					SQL,AMP,ORS,PIP,UER,MSG,PRM,Defaults,LG,TLS,JSN,
					Imm,TZ,TYPE,Assign,
				);
			}

		/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

			/**
			 * Registers instances of `GNRequest`
			 *
			 * @param {string} name The name of the request route
			 * @param {{}} configs The configurations for the request route 
			 * @memberof RESTFactory
			 */
			GNRequest(name,configs) { Points[name] = new GNRequest(name, configs.Actions); }
			/**
			 * Registers instances of `AURequest`
			 *
			 * @param {string} name The name of the request route
			 * @param {{}} configs The configurations for the request route 
			 * @memberof RESTFactory
			 */
			AURequest(name,configs) { Points[name] = new AURequest(name, configs.Actions); }
			/**
			 * Registers instances of `DBRequest`
			 *
			 * @param {string} name The name of the request route
			 * @param {{}} configs The configurations for the request route 
			 * @memberof RESTFactory
			 */
			DBRequest(name,configs) { Points[name] = new DBRequest(name, configs.Actions); }
			/**
			 * Registers the instance of the `Remote` for global use
			 *
			 * @memberof RESTFactory
			 */
			RMRequest() { let CL = Session.CL; !!CL && (_Remote = new Remote(CL)); }

			/**
			 * Initializes the `API Server`, `API Client`, or both
			 *
			 * @param {Session} session A `dffrnt`.`route`.`Session` instance
			 * @memberof RESTFactory
			 */
			Init(session) { 
				Session = session; 
				CONN.init(); Session.setSQLConn(CONN); 
				this.RMRequest();
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

