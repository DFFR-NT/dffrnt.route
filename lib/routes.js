
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	import {
		colors, Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
		ARGS, TYPE, EXTEND, HIDDEN, DEFINE, UoN, FUNCTION, IS,
		ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
		Dbg, LG, TLS, JSN
	} from 'dffrnt.utils';

	import   * 		 as Pages   from '../../../main/browser/lib/spaces';
	import { default as  NMSP } from '../../../config/namespaces.js';
	import { default as  REST } from './rest';
	import { default as  mime } from 'mime';

	// console.log('REST', REST);

	let API 	= null,
		Session = null,
		Express = null,
		Publics = {
			Folder:  null,
			Age: 	 3600,
			Matcher: /\?(?:\w+=.+)$/,
			Headers: function (file) {
				var age = Publics.Age; return {
					'content-type': 	 mime.lookup(file),
					'cache-control': 	'public, max-age='+age,
					'Expires': 			 new Date(Date.now() + age),
				};
			}
		},
		IO 		= null,
		Create 	= Object.create,
		HTTPREQ = ['GET','POST','PUT','DELETE'],
		defVal 	= function (req, res, next) { next(); },
		Valid 	= defVal,
		Socks 	= [],
		Spaces 	= {},
		SELF 	= this,
		AuthP 	= REST.Config.AuthP,
		 EndP 	= REST.Config.EndP,
		Setting = {};


/////////////////////////////////////////////////////////////////////////////////////
// ROUTE SENDERS

	/////////////////////////////////////////////////////////////////////////////////
	// Class.SocketRes (Socket Result-Object)
	var SocketRes = function (Socket) {}
	DEFINE(SocketRes.prototype, {
		links: 	HIDDEN(function ( links) { this.link = Assign({}, this.link, links); return this; }),
		status: HIDDEN(function (status) { this.statNum = status; return this; }),
		send: 	HIDDEN(function (result) {
			var THS = this, all = result.all, ret = { status: THS.statNum, payload: result };
			if (!!!all) { THS.Socket.compress(true).emit('receive', ret); }
			else { THS.Spaces.compress(true).to(THS.SID).emit('receive', ret); }
			LG.Server(THS.MID, 'Session', 'Recieved', 'green');
		}),
	});
	var SocketRes = EXTEND(SocketRes, function SocketRes (Socket) {
		var THS  = this, req = Socket.request, sess = req.session;
		THS.Socket = Socket; THS.Spaces = Socket.nsp; THS.link = {}; THS.statNum = 200;
		THS.SID = req.sessionID; THS.RID = Socket.id; THS.MID = THS.SID+THS.RID;
	});


/////////////////////////////////////////////////////////////////////////////////////
// ROUTE HANDLERS


	function PushRoute (router, request, scheme, handler, validation) {
		if (!!!validation) router[request](scheme, handler);
		else router[request](scheme, validation, handler);
	}
	function SockRoute (args) { Socks.push(args); }

	function ReqMerge (def, req) {
		var dfo = Imm.Map(def||{}), rqo = Imm.Map(req||{}),
			res = dfo.mergeDeep(rqo); return res.toObject();
	}
	function ReqPattern (name, act, noScheme) {
		name = name.toLowerCase();
		var pth = TLS.Path(!!act.Sub ? act.Sub.concat(name) : [name]),
			sch = (!!!noScheme ? (act.Scheme || '/') : '/');
		return TLS.Concat(pth.toLowerCase(), sch);
	}
	function ReqSocket (sid, socket, kind, action, path, key, param, validation) {
		var key = TLS.Path([action, key]),
			pnt = REST.Points[action],
			ses = socket.request.session,
			res = SocketRes(socket),
			hnd = ReqHandle[kind](pnt, path, param),
			def = { originalUrl: key,   headers: {},
					params: {}, body: {}, query: {}};
		// ---------
		socket.removeAllListeners(key);
		socket.on(key, function (req) {
			req = Assign(socket.request, def, req);
			validation(req, res, function () { hnd(req, res, null); });
		});
		return key;
	}
	var ReqHandle 	= {
		Valid: function (headers) {
			var validate = (headers == true || 'token' in headers);
			return validate ? function (req, res, next) {
				req.query.path = req.originalUrl;
				REST.Points.Auth.Validate(req, res, next);
			} : defVal;
		},
		Errs: function (point, err) {
			return function (req, res, next) {
				req.query.path = req.originalUrl;
				point.Error(sid, url, err.temp, err.status);
			};
		},
		Auth: function (point, path) {
			return function (req, res, next) {
				req.query.path = req.originalUrl;
				point[path](req, res, next);
			};
		},
		Data: function (point, path, param) {
			return function (req, res, next) {
				req.query.path = req.originalUrl;
				point[path](req, res, next);
			};
		},
	}


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
		pub.get("/", function (req, res) { res.status(403).send('Nope...'); });
		/////////////////////////////////////////////////////////////////////////////
		pub.get('/*', function (req, res) {
			var url = req.url, fle = url.replace(Publics.Matcher, ''),
				pth = fld.path(fle), sid = req.sessionID;
			res.status(200).sendFile(pth, {}, function (e) {
				if (!!e) { res.status(e.status).end(); }
				else { LG.Server(sid, 'EXTERNAL', fle, 'magenta'); }
			});
		});
		API.use(fld.root, pub);
	}
	function AddRoutes (routes, kind) {

		function AddRoute (route, name, kind) {
			var root 	= '/'+name.toLowerCase(),
				router 	= Express.Router({ mergeParams: true }),
				point 	= null;

			// Instantiate Route
				REST[kind](name, route);
				point = REST.Points[name];
				if ('Validate' in REST.Points[name]) {
					Valid = REST.Points[name].Validate;
				}

			// Error Handles
				Imm.Map(route.MSG).map(function mapErrors(paths, kind) {
					var err 	= REST.MSG[kind];
					paths.map(function (scheme, i) {
						PushRoute(router, 'all', scheme, ReqHandle.Errs(point, err));
					});
				});

			// Request Handles
			Imm.Map(route.Actions).map(function mapRequests(act, pth) {
				var allowd = act.Doc.Methods,
					denied = HTTPREQ.filter(function filterRequests(v, i) {
						return allowd.indexOf(v) < 0;
					});
				// Omit Middleware
				if (allowd.indexOf('MIDDLEWARE') < 0) {
					var scheme = ReqPattern(pth, act),
						key = ReqPattern(pth, act, true),
						vld = ReqHandle.Valid(act.Doc.Headers);
					// Handle Shit Requests
						denied.map(function mapDenied(M) {
							var func = M.toLowerCase(), err = REST.MSG['NO_'+M];
							PushRoute(router, func, scheme, ReqHandle.Errs(point, err), vld);
						});
					// Handle Good Requests
						// console.log(TLS.Path([name, key]))
						allowd.map(function mapAllowed(M) {
							var func = M.toLowerCase(), prm = REST.PRM[M];
							// console.log(func)
							if (kind == 'AURequest') { 	// Auth Request
								SockRoute(['Auth', name, pth, key, prm, vld]);
								PushRoute(router, func, scheme, ReqHandle.Auth(point, pth), vld);
							} else {					// Data Request
								SockRoute(['Data', name, pth, key, prm, vld]);
								PushRoute(router, func, scheme, ReqHandle.Data(point, pth, prm), vld);
							}
						});
				}
			});

			// Mount Router
				API.use(root, router);
		}

		if (!!routes)
			Imm.Map(routes).map(function mapRoutes(route, name) {
				AddRoute(route, name, kind);
			});
	}
	function AddSpaces (spaces) {

		function AddSpace (name, accessor) {
			accessor = !!accessor;
			/////////////////////////////////////////////////////////////////////////////
			var space = IO.of(name),
				filtr = function filterSocks(v,i) {
					var key = TLS.Path([v[1], v[3]]),
						pnt = ['/auth/login','/auth/logout'],
						res = (pnt.has(key) == accessor);
					return res;
				};

			/////////////////////////////////////////////////////////////////////////////
			space.on("connection", function onSockConn(socket) {

				/////////////////////////////////////////////////////////////////////
				// VAR / FUNCTIONS //////////////////////////////////////////////////

					var Req, token, MID = '', SID = '', NID = '', RID,
						authr 	= Create(REST.Points.Auth),
						Init 	= function Init() {
							// Get Session Data
							Req = socket.request; token = '';
							SID = Req.sessionID; RID = socket.id;
							MID = SID+RID; NID = name+'#'+SID;
							// For General Messages
							LG.Server(SID, 'Session', 'Detaching', 'magenta');
							// Setup the Ednpoints
							Socks.filter(filtr).map(function mapSocks(v, i) {
								ReqSocket.apply({}, [SID, socket].concat(v));
							});
							// For Auth Messages
							accessor && socket.join(SID);
						},
						Check 	= function doSockCheck() {
							if (accessor) {
								LG.Server(MID, 'Session', 'Checking', 'yellow');
								authr.Check(Req, SocketRes(socket));
							}
						};

				/////////////////////////////////////////////////////////////////////
				// HANDLERS /////////////////////////////////////////////////////////

					// Determine Socket's Intention
					if (accessor) {
						// For Session Reloading
						socket.on('reload', function onSockReload() {
							try {
								Req.session.reload( function reloadSession(err) {
									if (err) { LG.Error(MID, 'Session', 'Reload - ' + err.message); }
									else {	// session updated
										LG.Server(MID, 'Session', 'Reload', 'yellow');
									}
								});
							} catch (e) { LG.Error(MID, 'Session', 'Reload - ' + e.message); }
						});
						// // For Session Regeneration
						// socket.on('regenerate', function onSockRegen() {
							// Req.session.regenerate( function doSockRegen(err) {
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
						socket.on('setup', function onSockSetup() {
							var data; eval('data = '+sobj.Data.toString());
							socket.compress(true).emit('setup', data.bind(REST)());
						});
					}

					// General Handles
					socket.on('reconnect_attempt', function onSockReconnAtmpt(num) {
						LG.Error(MID, 'Session', 'Reconnecting (%d Attempt%s)'.format(num, (num>1?'s':'')));
					});
					socket.on('error', function onSockError(err) {
						LG.Error(MID, 'Session', 'Error - ' + err.message);
					});
					socket.on('disconnect', function onSockDisco() {
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
				fs.readFile(Publics.Folder.index, 'utf8', function (err,data) {
					var html; if (err) return console.log(err);
					html = data.replace(
						/<!-{2}[{]{2}([A-Z]+)[}]{2}-{2}>/g,
						function ($0, $key) { return space[$key.toLowerCase()]; }
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
				var nme = v.name, dsc = v.description, acc = v.accessor;
				Spaces[k] = AddSpace(nme, acc);
				// This sets the Main Auth Accessor
				if (acc) {
					Session.Accessor = Spaces[k];
				// This handles the NameSpace Sites
				} else {
					var rou = Express.Router();
					rou.get('/', AddSite(v));
					API.use(v.name, rou);
				}
				LG.Server(nme, 'NameSpace', msg.format(dsc), 'gray');
			});
		} else { Spaces['/'] = AddSpace('/'); }
	}


/////////////////////////////////////////////////////////////////////////////////////
// EXPORTS
	var MAKER = {
		Init: 		function Init(api, express, sess, setting) {
			API = api; Express = express; IO = sess.IO; Session = sess;
			Setting = setting; REST.Init(sess);
			API // Main Router Handles
				.use(function use404(err, req, res, next) {
					// Return 404 for all other requests
					res.status(404).send({ status: 1, request: req.originalUrl, error: err });
				})
				.all("/", ReqHandle.Valid(true), function mainRoute(req, res) {
					// Configure Main Route
					res.status(200)
					   .send(JSN.Valid(null, REST.Help, {}, {}, 1, 'General Help'));
				});
			// Chain It
			return MAKER.FileRoutes()
						.AuthRoutes(AuthP)
						.DataRoutes( EndP)
						.SiteRoutes();
		},
		FileRoutes: function FileRoutes( ) { AddFolder(); return MAKER; },
		AuthRoutes: function AuthRoutes(P) { AddRoutes(P, 'AURequest'); return MAKER; },
		DataRoutes: function DataRoutes(P) { AddRoutes(P, 'DBRequest'); return MAKER; },
		SiteRoutes: function SiteRoutes( ) { AddSpaces(NMSP); return MAKER; }
	};

	module.exports = MAKER;


/////////////////////////////////////////////////////////////////////////////////////

