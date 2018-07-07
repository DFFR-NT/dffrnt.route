
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  	{ colors, Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
			  ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
			  ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
			  preARGS, Dbg, LG, TLS, JSN
			} 					   = require('dffrnt.utils');
	const  	{ AuthP, EndP 		 } = require('dffrnt.confs');
	const  	{ UER,   MSG,   PRM  } = require('./errors');
	const  	{ SQL, Connection    } = require('dffrnt.model');
	const  	  Helper 			   = require('./help');
	const  	  TZ 				   = require('tzdata'); // !?!?!?!?!?!?!?!?

	let Help 		= Helper({ Params: {
			Page:  { Format: cls => SQL.OFFSET((parseInt(cls.page||0)-1)*parseInt(cls.limit)) },
			Limit: { Format: cls => SQL.LIMIT(parseInt(cls.limit)) },
		}	}),
		Docs 		= Help.Defaults, AMP = '+', ORS = ';', PIP = '|',
		Session 	= null,
		Points 		= {},
		CONN 		= new Connection();

/////////////////////////////////////////////////////////////////////////////////////////////
// General Handler

	/**
	 * A REST API Interface for Endpoint Handling & Documentation
	 * @class GNRequest
	 */
	class GNRequest {
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			constructor(Name, Configs) {
				var THS = this; THS.Name = Name;
				THS.NME = "/"+Name.toLowerCase();
				// Add Endpoints
				THS.Requests = Imm.OrderedMap(Configs)
								  .map((v, k)=>(v.Name=k,v));
			}

		/// ENFORCERS ///////////////////////////////////////////////////////////////////////

			Error	(req, res, err) {
				let url  = req.query.path = req.originalUrl,
					stat = err.status||400, msg = err.temp,
					opts = { options: {
						params: req.params, query: req.query
					}	},
					help = JSN.Help(
						url, msg, Help.Get(this.Name, url), stat
					).payload,
					load = Assign(help, opts);
				res.status(stat).send( load );
			}

			Limit	(req, res) {
				req.query.path = req.query.id; this.ER(
					res, MSG.RATELIMIT, { sessionID: req.sessionID }, 
					(req.session.user.acct||''), req.query
				)
			}

		/// DISTIBUTORS /////////////////////////////////////////////////////////////////////

			AL  	(msg, all) { return msg.replace(/%s/g, acct); }
			MS  	(msg, acct) { return msg.replace(/%s/g, acct); }
			OK  	(res, msg, usr, acct, qry, cde) {
				var name = (usr.Account || acct), stat = 200,
					payd = { message: this.MS(msg, name), user: usr },
					opts = { query: Assign({ path: '/auth/logout' }, qry||{}) },
					rtrn;
				if (IaN(cde)) payd.code = cde;
				rtrn = JSN.Valid(payd, opts, {},  stat);
				rtrn.all = this.ALL; res.status(stat).send(rtrn.payload);
			}
			SN  	(res, pay, opts, status) {
				var stat = (status || 200), link = opts.Links,
					rtrn = JSN.Valid(pay, opts.Options, link, stat);
				res.status(stat).send(rtrn.payload);
			}
			ER  	(res, hnd, err, acct, qry, all) {
				var msgs = this.MS(hnd.temp, acct), stat = (hnd.status||500),
					payd = { message: JSN.Error(msgs, err), error: err },
					opts = { query: Assign({ path: '/auth/logout' }, qry||{}) },
					rtrn; payd.code = 2;
				rtrn = JSN.Valid(payd, opts, {}, stat); rtrn.payload.all = all; 
				res.status(stat).send(rtrn.payload);
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

			constructor(Name, Configs) {
				super(Name, Configs); this.ALL = this.NME;
				// Create Documentation
				Help.Create(Name);
				this.Requests.map((RQ, R) => Help.Append(Name, RQ));
			}

		/// VARIABLES ///////////////////////////////////////////////////////////////////////

			get Passer  () { return Session.Passport; 	}
			get Token  	() { return Session.JWT; 		}
			get Cookie  () { return Session.Cookie; 	}
			get LDAP  	() { return Session.LDAP; 		}
			get Stores  () { return Session.Stores||{}; }
			get Client  () { return this.Stores.Client; }
			get Users  	() { return this.Stores.Users;  }
			get Script  () { return Session.Auth.SQL; 	}

		/// UTILITIES ///////////////////////////////////////////////////////////////////////

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
				var user= Assign({},row), frmt = Session.Auth.Format,
					account, profile, scopes = {}, scopeLst;
				if (!!!frmt) return user; //
				account = ( //
					(!!!frmt.Account) ?
					user[Object.keys(user)[0]] :
					user[frmt.Account]
				);
				profile = ( //
					(!!!frmt.Profile||frmt.Profile=="*") ?
					user : (user[frmt.Profile]||user)
				);
				//
				scopeLst = (frmt.Scopes||[]);
				scopeLst.map(function mapScopes(k, i) {
					scopes[k] = user[k];
				});
				return {
					Account: account,
					Profile: profile,
					Scopes:  scopes
				};
			}
			Match  	 (user) { return !!user ? JSON.parse(user) : {}; }
			Parse  	 (user) { return !!user ? JSON.parse(user) : {}; }
			Change   (older, newer) {
				try { return Imm.fromJS(older).equals(Imm.fromJS(newer)) === false; }
				catch (err) { return true; }
			}

		/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

			DeToken   (acct, token, next) {
				var THS = this;
				THS.Token.decode( THS.Cookie.Secret, token, function (err, decode) {
					if (!!err || !!!decode) { LG.Error(' {....} ', 'DeToken', err.name+' | '+err.message); }
					else { next(decode.scope); }
				});
			}
			Tokenize  (user, next) {
				var THS = this, acct = user.Account, scopes = user.Scopes, payload = Assign({
					iat: new Date().getUTCSeconds(), ver: "1.0.0", user: acct, scope: scopes,
					// "iss": os.hostname(), "aud": "World",
				});
				THS.Token.encode( THS.Cookie.Secret, payload, function (err, token) {
					if (err) {
						LG.Error( ' {....} ', 'Token', TLS.Concat(err.name, err.message));
					} else {
						LG.Server(' {....} ', 'Token', acct, 'magenta');
						THS.Users.set(acct, token); next(token);
					}
				});
			}
			Grant  	  (user, withToken, res, next) {
				var THS = this, acct = user.Account;
				THS.Users.get(acct, function (error, token) {
					var done = function (token) {
						if (!!withToken) { user.Token = token; }; next(user);
					}
					switch (true) {
						case  !!error: 	THS.ER(res, MSG.ERROR, error); break;;
						case !!!token: 	THS.Tokenize(user, done); break;;
							  default: 	THS.DeToken(acct, token, function (scp) {
							  				var scopes = user.Scopes;
							  				if (!THS.Change(scopes, scp)) done(token);
							  				else THS.Tokenize(user, done);
										});
					}
				});
			}
			Profile   (acct, withToken, res, next) {
				var THS = this, erQ = { path: '/error' }, user = {};
				CONN.acquire(function (con) {
					con.query(THS.Script.Profile,[acct], function(err, rows) {
						switch (true) {
							case  !!err:  THS.ER(res, MSG.ERROR,  err, acct, erQ); break;;
							case !!!rows: THS.ER(res, MSG.EXISTS, UER, acct, erQ); break;;
							default: THS.Grant(THS.Format(rows[0]), withToken, res, next);
						}
					})
				}, err => LG.Error(err.message, 'Database', 'GET'));
			}
			Renew  	  (req) {
				var THS = this, MX = THS.Cookie.Age, EX = req.session.cookie.maxAge;
				if ( EX / MX <= 0.20 ) { req.session.touch(); req.session.save(); }
			}
			Session   (config) {
				var THS = this; return function (req, res, next) {
					var sess = req.session, sid = req.sessionID;
					// --
					try {
						var Pick = function Pick (which, obj) {
								var handle = config[which];
								switch (typeof(handle)) {
									case 'string': THS.ER(res, MSG[handle], obj, null, req.query); break;;
									case 'function': handle.apply(THS, [req, res, next]); break;;
								}
							};
						// --
						if (!!config.Decrypt) THS.Decrypt(req);
						// --
						switch (true) {
							case !!!sess.user: Pick('NoData', { sessionID: sid }); break;;
							default: config.Main.apply(THS, [req, res, next]);
						}
					} catch (err) {
						console.log(err);
						console.trace();
						Pick('Error', err);
					}
				}
			}

		/// INITIALIZER /////////////////////////////////////////////////////////////////////

			Init  (defaults) {
				var THS = this;
				THS.Requests.map(function (RQ, R) {
					THS[RQ.Name] = function Request() {
						switch (typeof(RQ.Proc)) {
							case 'object': return THS.Session(RQ.Proc).apply(THS, arguments);
							case 'function': return RQ.Proc.apply(THS, arguments);
						}
					}
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

			constructor(Name, Configs) {
				super(Name, Configs); this.Name = Name;
				Help.Create(Name); // Create Documentation
			}

		/// UTILITIES ///////////////////////////////////////////////////////////////////////

			Clause  (cls, fnc) {
				var res = {}, keys = Object.keys(fnc);
				keys.map(function (ky, k) {
					res[ky] = fnc[ky].Format(cls);
				});
				return res;
			}
			Clean   (func) {
				let F = func.toString(), M = /^(?!function)(.+)/, 
					T = F.split("\n").slice(-1)[0].match(/^(\s+|)/)[0],
					G = new RegExp(`^${T}`,'gm'), R = 'function $1';
				return F.replace(M,R).replace(G,'');
			}
			Parse  	(RQ, RT, QY) {
				try { if (!!RQ.Parse) {
						var THS = Assign(this, {RQ:RQ,QY:QY}),
							PRS = RQ.Parse.bind(THS); return PRS(RT); }
					else if (!!eval(QY.single)) return RT[0];
					else return JSN.Objectify(RT, RQ.Key, RQ.Columns, QY);
				} catch (e) { console.log(e); console.trace(); return {}; }
			}
			Path  	() {
				var itms = [this.NME], args = TLS.Args(arguments);
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

			Init  (defaults) {
				var THS = this;
				THS.Requests.map(function (RQ, R) {
					// Setup Default Query; Route Paths;
						var Defq = {}, Routes = !!RQ.Routes ? RQ.Routes : [], DocP = Docs.Params;
					// Insert Pagination Formatters
						Imm.OrderedMap(DocP).map(function (v,k,i) {
							if (RQ.Params.hasOwnProperty(k) && 
								RQ.Params[k]===true) RQ.Params[k] = v;
						});
					// Setup Defaults
						Imm.OrderedMap(RQ.Params).map(function (v,k,i) {
							if (v.Desc.to==='query' && v.hasOwnProperty('Default'))
								Defq[k.toLowerCase()] = v.Default;
						});
					// Clean the SQL; Create Help-Doc
						RQ.Query = THS.SQL(RQ); Help.Append(THS.Name, RQ);
					// Request Handler
					THS[RQ.Name] = function (req, res) {
						/*
							var start = new Date(), rel, end;*/
						var prm = TLS.Fill(req.params, JSN.MapWith(RQ.Clause, 'Default')),
							qry = Assign({}, Defq, req.body, req.query),
							opt = THS.Opts(prm), pth = THS.Path(Routes),
							onSuccess = function (con) {
								return function (rer, ret) {
									/*
										end = new Date();*/
									!!con && con.release(); RQ.links = {}; // Release connection; if needed
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
																	},Imm.Map(v))
																 }); sts = sts.toJS();
																 LG.IF('STATUS:',sts,'\n');
																 ret.filter(v=>!TYPE(v,T))
																	.map(v=>{vls=vls.concat(v);}); 
																 break;
											};	itms = THS.Parse(RQ, vls, qry); 
										} catch (e) { console.log(e); }
									// Configure Query Options
										try { opts = JSN.Optify(qry, itms, pth, opt, RQ.links); } 
										catch (e) { console.log(e); console.trace(); }
									// Configure Pagination
										opts.Links.prev = SQL.SOCKET({ link: opts.Links.prev });
										opts.Links.next = SQL.SOCKET({ link: opts.Links.next });
									// Send to WebSocket or XHR
										/*console.log("QRY Duration: %s", end - start)*/
										THS.SN(res, (err || itms), opts);
								};
							},
							onFailure = function (ident) {
								// Something fails before Query executes
								return function (err) { 
									LG.Error(err.message, ident, 'GET');
									THS.Error(res, req.originalUrl, err.message, 500);
								};
							};
						// Determine if Database is needed or not
						if (!!RQ.Query.match(/^function/)) try {
								let cls = THS.Clause(Assign({}, prm, qry), RQ.Params),
									Q = RQ.Query, FNC; LG.IF(`\n${Q}\n`); 
								eval(`FNC = (${Q})`); onSuccess()(...FNC(cls));
							} catch (e) { console.log(e); onFailure('Backend'); 
						} else CONN.acquire( // Acquire a Pool Connection
							function (con) { // Connection Succeeded
								/*
									end = new Date(); console.log("CON Duration: %s", end - start)
									*/
								let cls = THS.Clause(Assign({}, prm, qry), RQ.Params),
									sql = SQL.FORMAT(RQ.Query, cls, Points),
									pgn = SQL.PAGE(qry);
								con.query({ sql: sql, typeCast: THS.Cast(RQ) }, onSuccess(con));
							}, 	onFailure('Database')
						);
					};
				}); return this;
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

	function BINDER (func) {
		var RX = /^function \(\) \{([\S\s]+)\};?$/,
			FN = new Function(
				'SQL','AMP','ORS','PIP','UER','MSG','PRM','Docs','LG','TLS','JSN','Imm','TZ',
				func.toString().match(RX)[1]
			);
		return FN(SQL,AMP,ORS,PIP,UER,MSG,PRM,Docs,LG,TLS,JSN,Imm,TZ);
	}

	const 	Config   = { AuthP: BINDER(AuthP), EndP: BINDER(EndP) };
	Docs.Params = Assign(Docs.Params,Config.EndP.__DEFAULTS);

	
	const REST = {
		Init(session) { CONN.init(); Session = session; Session.setSQLConn(CONN); },
		GNRequest(name,configs) { Points[name] = new GNRequest(name, configs.Actions); },
		AURequest(name,configs) { Points[name] = new AURequest(name, configs.Actions); },
		DBRequest(name,configs) { Points[name] = new DBRequest(name, configs.Actions); },
		Points: Points,
		Config: Config,
		SQL: 	SQL,
		UER: 	UER,
		MSG: 	MSG,
		PRM: 	PRM,
		Help: 	Help.Document,
		Docs: 	Docs,
	};

	module.exports = REST;


/////////////////////////////////////////////////////////////////////////////////////////////

