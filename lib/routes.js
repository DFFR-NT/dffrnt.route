
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  {
		colors, Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
		ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
		ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
		preARGS, Dbg, LG, TLS, JSN
	} 				= require('dffrnt.utils');
	const    Pages  = require('../../../main/browser/lib/spaces');
	const  { NMSP } = require('dffrnt.confs');
	const  { MSG  } = require('./errors');
	const    REST   = require('./rest');
	const    mime   = require('mime');
	const   moment  = require('moment');

	const 	SELF 	= this,
			Create 	= Object.create,
			HTTPREQ = ['GET','POST','PUT','DELETE'],
			AuthP 	= REST.Config.AuthP,
			 EndP 	= REST.Config.EndP,
			DFLVLD 	= (req, res, next) => { next(); },
			Socks 	= [],
			Spaces 	= {},
			Publics = {
				Folder:  null,
				Age: 	 3600,
				Matcher: /\?(?:\w+=.+)$/,
				Headers  (file) {
					var age = Publics.Age; return {
						'content-type': 	 mime.lookup(file),
						'cache-control': 	'public, max-age='+age,
						'Expires': 			 new Date(Date.now() + age),
					};
				}
			},
			GetHelp = (req, res) => {
				let msg = MSG.HELP // Configure Main Route
				res.status(msg.status).send(
					JSN.Valid(REST.Help.Document, {}, {}, 1, msg.temp)
				);
			};

	let 	API 	= {},
			HLP 	= null,
			Session = null,
			Express = null,
			IO 		= null,
			Setting = {};

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE SENDERS

	// Class.SocketRes //////////////////////////////////////////////////////////////////////
	class SocketRes {
		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

			constructor(Socket) {
				var THS  = this, req = Socket.request, sess = req.session;
				THS.Socket = Socket; THS.Spaces = Socket.nsp; THS.link = {}; THS.statNum = 200;
				THS.SID = req.sessionID; THS.RID = Socket.id; THS.MID = THS.SID+THS.RID;
				THS.connection = THS.Socket.conn;
			}

		/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

			links  	( links) { this.link = Assign({}, this.link, links); return this; }
			status  (status) { this.statNum = status; return this; }
			send  	(result) {
				var THS = this, all = result.all, 
					ret = { status: THS.statNum, payload: result };
					delete ret.payload.all;
				if (!!!all) { THS.Socket.compress(true).emit('receive', ret); }
				else { THS.Spaces.compress(true).to(THS.SID).emit('receive', ret); }
				LG.Server(THS.MID, 'Session', 'Recieved', 'green');
			}
	}

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE HANDLERS

	function PushRoute (router, request, scheme, handler, limits, validation) {
		if (!!!validation) router[request](scheme, limits, handler);
		else router[request](scheme, limits, validation, handler);
	}
	function SockRoute (...args) { Socks.push(args); }

	function ReqLog (name, router) {
		LG.IF(`\n\n\n\n${name} |`, router.stack.map((v,i) => {
			let r = v.route, m = Object.keys(r.methods)[0];
			return { [m]: r.path };
		}));
	}
	function ReqMerge (def, req) {
		var dfo = Imm.Map(def||{}), rqo = Imm.Map(req||{}),
			res = dfo.mergeDeep(rqo); return res.toObject();
	}
	function ReqPattern (name, act, noScheme) {
		name = name.toLowerCase();
		var pth = TLS.Path(!!act.Sub ? act.Sub.concat(name) : [name]),
			sch = (!!!noScheme ? (act.Scheme || '/') : '/');
		// console.log(pth, sch, TLS.Concat(pth.toLowerCase(), sch))
		return TLS.Concat(pth.toLowerCase(), sch);
	}
	function ReqSocket (sid, socket, action, path, key, limits = [], validation, scheme) {
		var key = TLS.Path([action, key]),
			pnt = REST.Points[action],
			res = new SocketRes(socket),
			hnd = ReqHandle.Main(pnt, path),
			err = ReqHandle.Errs(pnt, MSG.BAD_REQ),
			def = { originalUrl: key,   headers: {},
					params: {}, body: {}, query: {}},
			chk =limits.concat([
					validation,
					function run(req, res) { 
						let url = req.originalUrl,
							prm = Object.values(req.params).join('/'),
							sch = `${url}/${prm}`;
						switch (!!sch.match(scheme)) {
							case  true: hnd(req, res, null); break;;
							case false: err(req, res, null); break;; 
						}
					}]),
			cnt =chk.length,
			lmt =chk.slice()
					.reverse()
					.reduce(acc => { cnt--;
						let afn = (TYPE(acc,'Function')?`chk[${cnt}](req,res)`:acc),
							fnc = `()=>{\n${afn.replace(/^/gm,' '.dup(4))}\n}`;
						return `chk[${cnt-1}](req, res, ${fnc}, ${cnt})`;
					});
		// ---------
		socket.removeAllListeners(key);
		socket.on(key, req => {
			req = Assign(socket.request, def, req);
			eval(lmt); // Rate Limits / Validation
		});
		return key;
	}
	function ReqLimitDur(key) { try {
			let dur = ((key||'').split('/')[1]||'1Day')
						.match(/^(\d*)(.*)$/),
				len = dur[1]||1, uni = dur[2];
			return moment.duration(Number(len),uni)
						.asMilliseconds();
		} catch (e) { 
			return moment.duration(1,'day')
						 .asMilliseconds();
	}; }
	const 	ReqHandle 	= {
				Valid (headers) {
					var validate = (headers == true || 'token' in (headers||{}));
					return validate ? function Validate(req, res, next) {
						req.query.path = req.originalUrl;
						REST.Points.Auth.Validate(req, res, next);
					} : DFLVLD;
				},
				Limit (kind,limiter,point,key,path) {
					let HND = point.Limit,
						PTH = path.replace(/[/]+$/,''),
						RQL = (!!key&&(point.Requests.get(key)||{}).Limits||[]),
						AFL = (l=>!!!(ALL[l].omit||[]).has(path)),
						OFL = (l=>RQL.has(l)),
						LMT = Setting.Session.Limits, 
						ALL = LMT.All,		ALK = Object.keys(ALL), A,
						OPT = LMT.Optional, OPK = Object.keys(OPT), O;
					let ret = ALK .filter(AFL)
								.map(l=>(A = Assign({},ALL[l]),
										 A.onRateLimited=HND,
										 A.skipHeaders=true,
										 A.expire=ReqLimitDur(l),
										 A.path='*',
										 limiter(A)))
								.concat(OPK
									.filter(OFL)
									.map(l=>(O = Assign({},OPT[l]),
											 O.onRateLimited=HND,
											 O.skipHeaders=true,
											 O.expire=ReqLimitDur(l),
											 O.path=PTH,
											 limiter(O)))
								);
					return ret;
				},
				Errs  (point, err) {
					return (req, res) => {
						point.Error(req, res, err);
					};
				},
				Main  (point, path) {
					return (req, res, next) => {
						req.query.path = req.originalUrl;
						point[path](req, res, next);
					};
				},
			};

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE CONFIGURATION

	// This endpoint is hit when the browser is requesting /{{folder}}/*.*
	function AddFolder () {
		if (!!!Setting.Public) return false; // Abort, if unneeded.
		let PUB = Setting.Public;
		Publics.Folder 	= new FOLDER(PUB.Folder,PUB.Age);
		Publics.Age 	= PUB.Age||Publics.Age;
		Publics.Matcher = PUB.Matcher||Publics.Matcher;
		Publics.Headers = PUB.Headers||Publics.Headers;
		/////////////////////////////////////////////////////////////////////////////
		var pub = Express.Router(), fld = Publics.Folder, mch = Publics.Matcher;
		/////////////////////////////////////////////////////////////////////////////
		pub.get("/", (req, res) => { res.status(403).send('Nope...'); });
		/////////////////////////////////////////////////////////////////////////////
		pub.get('/*', (req, res) => {
			var url = req.url, fle = url.replace(Publics.Matcher, ''),
				pth = fld.path(fle), sid = req.sessionID;
			res.status(200).sendFile(pth, {}, e => {
				if (!!e) { res.status(e.status).end(); }
				else { LG.Server(sid, 'EXTERNAL', fle, 'magenta'); }
			});
		});
		API.use(fld.root, pub);
	}
	//
	function AddRoutes (routes, kind) {

		function AddRoute (route, name, kind) {
			let root 	= '/'+name.toLowerCase(),
				router 	= Express.Router({ mergeParams: true }),
				hroute 	= Express.Router({ mergeParams: true }),
				lstore  = Session.Stores.Limits,
				point 	= null, limiters = { 
					root: Session.Limiter(router, lstore), 
					help: Session.Limiter(hroute, lstore)
				}, 	hlimit;

			// Instantiate Route
				REST[kind](name, route);
				point = REST.Points[name];

			// Handle Validation
				if ('Validate' in REST.Points[name])
					Valid = REST.Points[name].Validate;	
				hlimit  = ReqHandle.Limit('help',limiters.help,point,'/',`${root}/`);

			// Handle Documentation (root); if applicable
				if (!Object.keys(route.Actions).has('/')) PushRoute(
					hroute, 'all', '/', ReqHandle.Errs(point, '/'), 
					hlimit, ReqHandle.Valid(true)
				);

			// Handle Errors
				Imm.Map(route.Errors).map((paths, which) => {
					paths.map((scheme, i) => { PushRoute(
						router, 'all', scheme, ReqHandle.Errs(point, MSG[which]), 
						ReqHandle.Limit('erro',limiters.root,point,'/',`${root}${scheme}/`.replace(/[/]+$/,'/'))
					);	});
				});

			// Handle Points
				Imm.OrderedMap(route.Actions).map((act, pth) => {
					let allowd = act.Doc.Methods,
						denied = HTTPREQ.filter((v,i)=>allowd.indexOf(v)<0);
					// Omit Middleware
					if (allowd.indexOf('MIDDLEWARE') < 0) {
						// console.log('it was here')
						let scheme 	= ReqPattern(pth, act),
							key 	= ReqPattern(pth, act, true),
							vld 	= ReqHandle.Valid(act.Doc.Headers),
							dir 	= `${root}${ReqPattern(pth, act, true)}`,
							lmt 	= ReqHandle.Limit('endp',limiters.root, point, pth, dir);
						// Handle Douchebag Requests
							denied.map(M => {
								let func = M.toLowerCase(), err = MSG['NO_'+M];
								PushRoute(router, func, scheme, ReqHandle.Errs(point, err), lmt, vld);
							});
						// Handle Good-Guy Requests
							allowd.map(M => {
								let func = M.toLowerCase(),
									schm = new RegExp(
											`${name.toLowerCase()}\\/${scheme.slice(1,-1)}`
												.replace(/\/{2,}/g,'')
												.replace(/([^\\])\//g,'$1\\/')
												.replace(/([\/(]):\w+(?=[(])/g,'$1')
											);
								SockRoute(name, pth, key, lmt, vld, schm); // Socket Request
								PushRoute(router, func, scheme, ReqHandle.Main(point, pth), lmt, vld);
							});
						// Handle Documentation (sub)
							PushRoute(hroute, 'all', key, ReqHandle.Errs(point, pth), hlimit, vld);
					}
				});

			// Mount Router
				API.use(root, router); // Requests Path
				HLP.use(root, hroute); // Document Path

			// Return to Initialize
				return point;
		}

		// Create each Point
		if (!!routes) 
			Imm .OrderedMap(routes)
				.filter((v,k)=>k!="__DEFAULTS")
				.map((route, name)=>AddRoute(route, name, kind))
				.map(route=>route.Init());
	}
	function AddDocs   () {
		// Create Helpdoc Route
		HLP .all("/", ReqHandle.Valid(true), GetHelp);
		API .use('/help', HLP);
	}
	//
	function AddSpaces (spaces) {

		function AddSpace (name, accessor) {
			accessor = !!accessor;
			/////////////////////////////////////////////////////////////////////////////
			let space = IO.of(name),
				filtr = (v,i) => {
					var key = TLS.Path([v[0], v[2]]),
						pnt = ['/auth/login','/auth/logout'],
						res = (pnt.has(key) == accessor);
					return res;
				};

			/////////////////////////////////////////////////////////////////////////////
			space.on("connection", socket => {

				/////////////////////////////////////////////////////////////////////
				// VAR / FUNCTIONS //////////////////////////////////////////////////

					let Req, token, MID = '', SID = '', NID = '', RID,
						authr 	= Create(REST.Points.Auth),
						Init 	= () => {
							// Get Session Data
							Req = socket.request; token = '';
							SID = Req.sessionID; RID = socket.id;
							MID = SID+RID; NID = name+'#'+SID;
							// For General Messages
							LG.Server(SID, 'Session', 'Detaching', 'magenta');
							// Setup the Ednpoints
							Socks.filter(filtr).map((v, i) => {
								ReqSocket(...[SID, socket].concat(v));
							});
							// For Auth Messages
							accessor && socket.join(SID);
						},
						Check 	= () => {
							if (accessor) {
								LG.Server(MID, 'Session', 'Checking', 'yellow');
								authr.Check(Req, new SocketRes(socket));
							}
						};

				/////////////////////////////////////////////////////////////////////
				// HANDLERS /////////////////////////////////////////////////////////

					// Determine Socket's Intention
					if (accessor) {
						// For Session Reloading
						socket.on('reload', () => {
							try { Req.session.reload( err => {
								if (!!!err) LG.Server(MID, 'Session', 'Reload', 'yellow');
								else LG.Error(MID, 'Session', 'Reload - ' + err.message);
							}); } catch (e) {
								LG.Error(MID, 'Session', 'Reload - ' + e.message);
							}
						});
						// // For Session Regeneration
						// socket.on('regenerate', () => {
							// Req.session.regenerate( err => {
							// 	if (err) { LG.Error(MID, 'Session', 'Regenerate - ' + err.message); }
							// 	else {	// session updated
							// 		Init(); LG.Server(MID, 'Session', 'Regenerate', 'yellow');
							// 	}
							// });
						// });
					} else {
						// For Broadcasting End-Points to Client
						var snme = name.replace("/",""), sobj = Pages[snme];
						// -------------------------------------------------------
						if (!!!sobj) sobj = Pages['dft-page'];
						sobj.Data  = (sobj.Data ||Pages['dft-page'].Data );
						sobj.Build = (sobj.Build||Pages['dft-page'].Build);
						// -------------------------------------------------------
						socket.on('setup', () => {
							var data; eval('data = '+sobj.Data.toString());
							socket.compress(true).emit('setup', data.bind(REST)());
						});
					}

					// General Handles
					socket.on('reconnect_attempt', num => {
						LG.Error(MID, 'Session', 'Reconnecting (%d Attempt%s)'.format(num, (num>1?'s':'')));
					});
					socket.on('error', err => {
						LG.Error(MID, 'Session', 'Error - ' + err.message);
					});
					socket.on('disconnect', () => {
						LG.Server(MID, 'Session', 'Disconnected', 'red');
					});

				/////////////////////////////////////////////////////////////////////
				// SETUP ////////////////////////////////////////////////////////////

					// Log the Connection
					Init(); LG.Server(MID, 'Session', 'Connected', 'yellow');
					// Check if Authorized
					Check();

			}); return space;
		}
		function AddSite (space) {
			return function AddingSite(req, res) {
				var maxAge = Publics.Age;
				LG.Server(req.sessionID, 'EXTERNAL', req.url, 'magenta');
				fs.readFile(Publics.Folder.index, 'utf8', (err,data) => {
					var html; if (err) return LG.Error(err);
					html = data.replace(
						/<!-{2}[{]{2}([A-Z]+)[}]{2}-{2}>/g,
						($0, $key) => { return space[$key.toLowerCase()]; }
					);
					res.set({
						'Content-Type':  'text/html',
						'Cache-Control':  maxAge
					});
					res.status(200).send(html);
				});
			};
		}

		// Configure Socket-Routes
		var msg = 'An Application for %s';
		if (!!spaces) {
			Imm.Map(spaces).map((v,k) => {
				let nme = v.name, dsc = v.description, acc = v.accessor;
				Spaces[k] = AddSpace(nme, acc);
				// This sets the Main Auth Accessor
				if (acc) {
					Session.Accessor = Spaces[k];
				// This handles the NameSpace Sites
				} else {
					let rou = Express.Router();
					rou.get('/', AddSite(v));
					API.use(v.name, rou);
				}
				LG.Server(nme, 'NameSpace', msg.format(dsc), 'gray');
			});
		} else { Spaces['/'] = AddSpace('/'); }
	}


/////////////////////////////////////////////////////////////////////////////////////
// EXPORTS
	const 	MAKER = {
				Init(api, express, sess, setting) {
					API = api; Express = express; IO = sess.IO; Session = sess;
					HLP = Express.Router({ mergeParams: true });
					Setting = setting; REST.Init(sess);
					API // Main Router Handles
						.use((err, req, res, next) => {
							// Return 404 for all other requests
							res.status(404).send({ status: 1, request: req.originalUrl, error: err });
						})
						.all("/", ReqHandle.Valid(true), GetHelp);
					// Chain It
					let MK=MAKER.FileRoutes()
								.AuthRoutes(AuthP)
								.DataRoutes( EndP)
								.HelpRoutes()
								.SiteRoutes();

					return MK;
				},
				FileRoutes: function FileRoutes( ) { AddFolder(); return MAKER; },
				AuthRoutes: function AuthRoutes(P) { AddRoutes(P, 'AURequest'); return MAKER; },
				DataRoutes: function DataRoutes(P) { AddRoutes(P, 'DBRequest'); return MAKER; },
				SiteRoutes: function SiteRoutes( ) { AddSpaces(NMSP); return MAKER; },
				HelpRoutes: function HelpRoutes(P) { AddDocs(); return MAKER; }
			};

	module.exports = MAKER;

/////////////////////////////////////////////////////////////////////////////////////

