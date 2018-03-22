
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	// System Requires
		// --------------------------------------------
		eval(require('dffrnt.utils')());

	var ROOTD 		= require('app-root-path'),
		Errors 		= require('./errors.js'),
		Model 		= require('dffrnt.model'),
		Connection 	= Model.Connection,
		SQL 		= Model.SQL,
		Help 		= require('./help.js')({
			Params: {
				Page:  { Format: function (cls) { return SQL.OFFSET((parseInt(cls.page || 0) - 1) * parseInt(cls.limit)); }, },
				Limit: { Format: function (cls) { return SQL.LIMIT(parseInt(cls.limit)); } },
			}
		}),
		Docs 		= Help.Defaults, AMP = '+', ORS = ';', PIP = '|',
		Session 	= null,
		Points 		= {},
		Setting 	= require(ROOTD+'/config/settings.js')(),
		AuthP 		= require(ROOTD+'/config/authpoints.js'),
		 EndP 		= require(ROOTD+'/config/endpoints.js');


/////////////////////////////////////////////////////////////////////////////////////////////
// CONSTANTS
	const UER 		= Errors.UER;
	const MSG 		= Errors.MSG;
	const PRM 		= Errors.PRM;


/////////////////////////////////////////////////////////////////////////////////////////////
// General Handler

	var GNRequest = function (Name, Configs) {}

	/// DISTIBUTORS /////////////////////////////////////////////////////////////////////////
		DEFINE(GNRequest.prototype, {
			AL: 	HIDDEN(function (msg, all) { return msg.replace(/%s/g, acct); }),
			MS: 	HIDDEN(function (msg, acct) { return msg.replace(/%s/g, acct); }),
			OK: 	HIDDEN(function (res, msg, usr, acct, qry) {
				var name = (usr.Account || acct), stat = 200,
					payd = { message: this.MS(msg, name), user: usr },
					opts = { query: Assign({ path: '/auth/logout' }, qry||{}) },
					rtrn = JSN.Valid(payd, opts, {},  stat);
				rtrn.all = this.ALL; res.status(stat).send(rtrn.payload);
			}),
			SN: 	HIDDEN(function (res, pay, opts, status) {
				var stat = (status || 200), link = opts.Links,
					rtrn = JSN.Valid(pay, opts.Options, link, stat);
				res.status(stat).send(rtrn.payload);
			}),
			ER: 	HIDDEN(function (res, hnd, err, acct, qry, all) {
				var msgs = this.MS(hnd.temp, acct), stat = (hnd.status||500),
					payd = { message: JSN.Error(msgs, err), error: err },
					opts = { query: Assign({ path: '/auth/logout' }, qry||{}) },
					rtrn = JSN.Valid(payd, opts, {}, stat);
				rtrn.all = all; res.status(stat).send(rtrn.payload);
			}),
		});


/////////////////////////////////////////////////////////////////////////////////////////////
// Auth Handler
	var AURequest = function (Name, Configs) {};
		AURequest.prototype = Object.create(GNRequest.prototype);

	/// VARIABLES ///////////////////////////////////////////////////////////////////////////
		DEFINE(AURequest.prototype, {
			Passer: { get: function () { return Session.Passport; 	} },
			Token: 	{ get: function () { return Session.JWT; 		} },
			Cookie: { get: function () { return Session.Cookie; 	} },
			LDAP: 	{ get: function () { return Session.LDAP; 		} },
			Stores: { get: function () { return Session.Stores||{}; } },
			Client: { get: function () { return this.Stores.Client; } },
			Users: 	{ get: function () { return this.Stores.Users;  } },
			Script: { get: function () { return Session.Auth.SQL; 	} },
		});

	/// UTILITIES ///////////////////////////////////////////////////////////////////////////
		DEFINE(AURequest.prototype, {
			Decrypt: HIDDEN(function (req, userField, passField) {
				if (req.headers.hasOwnProperty('authorization')) {
					var auth = req.headers.authorization.split(' ')[1],
						buff = Buffer(auth, 'base64').toString().split(':');
					if (!!buff.length) {
						userField = userField || 'username'; passField = passField || 'password';
						req.body.username = buff[0]; req.body.password = buff.length > 1 ? buff[1] : '';
					}
				}
			}),
			Scopes:	 HIDDEN(function (user) {
				var flt = function (mem, m) { return mem.match(/Groups/); },
					map = function (mem, m) { return mem.split(/,?[A-Z]+\=/).slice(1,-1).reverse(); };
				return TLS.Tree(user.memberOf.filter(flt).map(map), "&");
			}),
			Photo: 	 HIDDEN(function (user) {
				var ph = user.thumbnailPhoto;
				return !!ph ? { Photo: 'data:image\/gif;base64,'+ph.toString('base64') } : {};
			}),
			Boss: 	 HIDDEN(function (manager) {
				var name = manager.split(/,?[A-Z]+\=/)[1].split(' '),
					acct = (name[0].split('')[0]+name[1]).toLowerCase(),
					pnts = '/users/:account:', qry = '?kind=ext';
				return { name: name, link: SQL.SOCKET({ link: pnts+acct+qry }) }
			}),
			Format:  HIDDEN(function Format(row) {
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
			}),
			Match: 	 HIDDEN(function (user) { return !!user ? JSON.parse(user) : {}; }),
			Parse: 	 HIDDEN(function (user) { return !!user ? JSON.parse(user) : {}; }),
			Change:  HIDDEN(function (older, newer) {
				try { return Imm.fromJS(older).equals(Imm.fromJS(newer)) === false; }
				catch (err) { return true; }
			}),
		});

	/// FUNCTIONS ///////////////////////////////////////////////////////////////////////////
		DEFINE(AURequest.prototype, {
			DeToken:  HIDDEN(function DeToken(acct, token, next) {
				var THS = this;
				THS.Token.decode( THS.Cookie.Secret, token, function (err, decode) {
					if (!!err || !!!decode) { LG.Error(' {....} ', 'DeToken', err.name+' | '+err.message); }
					else { next(decode.scope); }
				});
			}),
			Tokenize: HIDDEN(function Tokenize(user, next) {
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
			}),
			Grant: 	  HIDDEN(function Grant(user, withToken, res, next) {
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
			}),
			Profile:  HIDDEN(function Profile(acct, withToken, res, next) {
				var THS = this, erQ = { path: '/error' }, user = {};
				Connection.acquire(function (con) {
					con.query(THS.Script.Profile,[acct], function(err, rows) {
						switch (true) {
							case  !!err:  THS.ER(res, MSG.ERROR,  err, acct, erQ); break;;
							case !!!rows: THS.ER(res, MSG.EXISTS, UER, acct, erQ); break;;
							default: THS.Grant(THS.Format(rows[0]), withToken, res, next);
						}
					})
				});

			}),
			Renew: 	  HIDDEN(function Renew(req) {
				var THS = this, MX = THS.Cookie.Age, EX = req.session.cookie.maxAge;
				if ( EX / MX <= 0.20 ) { req.session.touch(); req.session.save(); }
			}),
			Session:  HIDDEN(function Session(config) {
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
					} catch (err) { console.trace(err); Pick('Error', err); }
				}
			}),
		});

	/// INITIALIZER /////////////////////////////////////////////////////////////////////////
		DEFINE(AURequest.prototype, {
			Init: HIDDEN(function () {
				var THS = this;
				THS.Requests.map(function (RQ, R) {
					THS[RQ.Name] = function Request() {
						switch (typeof(RQ.Proc)) {
							case 'object': return THS.Session(RQ.Proc).apply(THS, arguments);
							case 'function': return RQ.Proc.apply(THS, arguments);
						}
					}
				});
				return this;
			}),
		})

	/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////////
		var AURequest = EXTEND(AURequest, function AURequest (Name, Configs) {
			var THS = this;
			THS.NME = "/"+Name.toLowerCase();
			THS.ALL = THS.NME == '/auth';
			THS.Requests = Imm.Map(Configs).map(function (v, k) {
				v.Name = k; return v;
			}).toArray();

			// Create Documentation
				Help.Create(Name);
				THS.Requests.map(function (RQ, R) { Help.Append(Name, RQ); });

			// Error Handle
				DEFINE(THS, {
					Error: HIDDEN(ERRequest(Name))
				});
		});


/////////////////////////////////////////////////////////////////////////////////////////////
// Data Handler
	var DBRequest = function (Name, Configs) {};
		DBRequest.prototype = Object.create(GNRequest.prototype);

	/// UTILITIES ///////////////////////////////////////////////////////////////////////////
		DEFINE(DBRequest.prototype, {
			Clause: HIDDEN(function (cls, fnc) {
				var res = {}, keys = Object.keys(fnc);
				keys.map(function (ky, k) { res[ky] = fnc[ky].Format(cls); });
				return res;
			}),
			Parse: 	HIDDEN(function (RQ, RT, QY) {
				try {
					// console.log('REQUEST:', JSON.stringify(QY,null,'  '))
					if (!!RQ.Parse) {
						var THS = Assign(this, {RQ:RQ,QY:QY}),
							PRS = RQ.Parse.bind(THS);
						return PRS(RT);
					} else {
						return JSN.Objectify(RT, RQ.Key, RQ.Columns, QY);
					}
				} catch (e) {
					console.trace(e);
					return {};
				}
			}),
			Path: 	HIDDEN(function () {
				var itms = [this.NME], args = TLS.Args(arguments);
				args.filter(function (ag, a) { return !!ag; })
					.map(function (it) {
						if (!it instanceof Array) itms.push(it);
						else itms = itms.concat(it);
					});
				return TLS.Path(itms);
			}),
			Cast: 	HIDDEN(function (RQ) {
				return 	RQ.hasOwnProperty('Cast') ? function (field, next) {
							RQ.Cast(field); return SQL.TYPE(field, next)
						} : SQL.TYPE;
			}),
			Opts: 	HIDDEN(function (cls) {
				return JSN.MapEdit(cls, function (val) { return val.split(';'); });
			}),
			SQL:  	HIDDEN(function (RQ) { return RQ.Query.join("\n").replace("\t", ""); }),
		});

	/// INITIALIZER /////////////////////////////////////////////////////////////////////////
		DEFINE(DBRequest.prototype, {
			Init: HIDDEN(function () {
				var THS = this;
				THS.Requests.map(function (RQ, R) {
					// Setup Default Query; Route Paths;
					var Defq = {}, Routes = !!RQ.Routes ? RQ.Routes : [], DocP = Docs.Params;
					// Insert Pagination Formatters
					Imm.Map(DocP).map(function (v,k,i) {
						if (RQ.Params.hasOwnProperty(k)) {
							if (RQ.Params[k] === true) {
								RQ.Params[k] = v; Defq[k.toLowerCase()] = v.Default;
							}
						}
					});
					// Clean the SQL; Create Help-Doc
					RQ.Query = THS.SQL(RQ); Help.Append(THS.Name, RQ);
					// Request Handler
					THS[RQ.Name] = /*FUNCTION(*/function (req, res, next) {
						var prm = TLS.Fill(req.params, JSN.MapWith(RQ.Clause, 'Default')),
							qry = Assign({}, Defq, req.body, req.query),
							opt = THS.Opts(prm),
							pth = THS.Path(Routes); //LG.Object(prm);
						var start = new Date(), rel, end;
						// Acquire a Pool Connection
						Connection.acquire(
							// Connection Succeeded
							function (con) {
								// end = new Date(); console.log("CON Duration: %s", end - start)
								var pgn = SQL.PAGE(qry);
								con.query({
									sql: SQL.FORMAT(RQ.Query, THS.Clause(Assign({}, prm, qry), RQ.Params)),
									typeCast: THS.Cast(RQ)
								}, function (err, ret) {
									/*end = new Date();*/
									con.release(); var itms = {}, opts = {}; RQ.links = {};
									try { itms = THS.Parse(RQ, ret, qry); } catch (e) { console.trace(e); }
									try { opts = JSN.Optify(qry, itms, pth, opt, RQ.links); } catch (e) {}
									opts.Links.prev = SQL.SOCKET({ link: opts.Links.prev });
									opts.Links.next = SQL.SOCKET({ link: opts.Links.next });
									// --
									// console.log("QRY Duration: %s", end - start)
									THS.SN(res, (err || itms), opts);
								});
							},
							// Connection Failed
							function (err) {
								LG.Error(err.message, 'Database', 'GET');
								THS.Error(res, req.originalUrl, err.message, 500);
							}
						);
					}/*, {
						prm: JSN.MapWith(RQ.Clause, 'Default'),
						qry: ,
						res: ,
						callback:
					})*/;
				});
			}),
		});

	/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////////
		var DBRequest = EXTEND(DBRequest, function DBRequest (Name, Configs) {
			var THS = this; THS.Name = Name;
			THS.NME = "/"+Name.toLowerCase();
			THS.Requests = Imm.Map(Configs).map(function (v, k) {
				v.Name = k; return v;
			}).toArray();

			// Create Documentation
			Help.Create(Name);

			// Main Handles
			THS.Init();

			// Error Handle
			THS.Error = ERRequest(Name).bind(THS);
		});


/////////////////////////////////////////////////////////////////////////////////////////////
// Error Handler
	function ERRequest (Name) {
		return function (res, url, msg, stat) {
			stat = stat || 400;
			res.status(stat).send(
				JSN.Help(url, msg, Help.Get(Name), stat).payload
			);
		}
	}


/////////////////////////////////////////////////////////////////////////////////////////////
// TESTING

	// console.log( "%s", SQL.QRY()
					// .SLC({
					// 	tid: 	'ct.client_text_id',
					// 	name: 	'ct.client_name',
					// 	brand: 	'b.brand_name',
					// 	live: 	'ct.live_date',
					// 	sid: 	'ct.status_id',
					// 	hid: 	'ct.hotel_code',
					// 	nid: 	'ct.navision_code',
					// 	cid: 	'ct.client_id',
					// })
					// // .AND('ct.navision_code', 'IS', 'NOT NULL'	)
					// .FROM('clients', 'ct')
					// .JOIN('INNER', 'client_brands', 	  'b', { ON: 'ct.brand_id', 	'=': 'b.brand_id' 		})
					// .JOIN('INNER', 'client_isp', 		  'i', { ON: 'i.client_id', 	'=': 'ct.client_id' 	})
					// .JOIN('INNER', 'client_network_info', 'n', { ON: 'n.client_isp_id', '=': 'i.client_isp_id' 	})
					// .WHR('ct.status_id', 	 'IN', '(1,2,3,4,5)')
					// .AND('ct.navision_code', 'IS', 'NOT NULL'	)
					// .AND(':TERMS:')
					// .LMT(':ITEMS:')
					// .OFS(':PAGE:' ).toPretty()
	// );


/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	function BINDER (func) {
		var RX = /^function \(\) \{([\S\s]+)\};?$/,
			FN = new Function(
				'SQL','AMP','ORS','PIP','UER','MSG','PRM','Docs',
				func.toString().match(RX)[1]
			);
		return FN(SQL,AMP,ORS,PIP,UER,MSG,PRM,Docs);
	}

	module.exports = {
		Init: 		function (session) { Connection.init(); Session = session; Session.setSQLConn(Connection); },
		AURequest: 	function (name, configs) { Points[name] = new AURequest(name, configs.Actions).Init(); },
		DBRequest: 	function (name, configs) { Points[name] = new DBRequest(name, configs.Actions); },
		Points: 	Points,
		Config: 	{ AuthP: BINDER(AuthP), EndP: BINDER(EndP) },
		SQL: 		SQL,
		UER: 		UER,
		MSG: 		MSG,
		PRM: 		PRM,
		Help: 		Help.Document,
		Docs: 		Docs,
	};


/////////////////////////////////////////////////////////////////////////////////////////////

