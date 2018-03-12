
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES
	var ROOTD 	= require('app-root-path'),
		rest 	= require('./rest'),
		mime 	= require('mime'),
		API 	= null,
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
		Pages 	= require(ROOTD+'/main/browser/lib/spaces'),
		 NMSP 	= require(ROOTD+'/config/namespaces.js'),
		AuthP 	= rest.Config.AuthP,
		 EndP 	= rest.Config.EndP,
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
			pnt = rest.Points[action],
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
	function ReqRoute (router, request, scheme, handler, validation) {
		if (!!!validation) router[request](scheme, handler);
		else router[request](scheme, validation, handler);
	}
	var ReqHandle 	= {
		Valid: function (headers) {
			var validate = (headers == true || 'token' in headers);
			return validate ? function (req, res, next) {
				req.query.path = req.originalUrl;
				rest.Points.Auth.Validate(req, res, next);
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
		Publics.Folder 	= new FOLDER(Setting.Public.Folder);
		Publics.Age 	= Setting.Public.Age||Publics.Age;
		Publics.Matcher = Setting.Public.Matcher||Publics.Matcher;
		Publics.Headers = Setting.Public.Headers||Publics.Headers;
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
				rest[kind](name, route);
				point = rest.Points[name];
				if ('Validate' in rest.Points[name]) {
					Valid = rest.Points[name].Validate;
				}

			// Error Handles
				Imm.Map(route.MSG).map(function (paths, kind) {
					var err 	= rest.MSG[kind];
					paths.map(function (scheme, i) {
						ReqRoute(router, 'all', scheme, ReqHandle.Errs(point, err));
					});
				});

			// Request Handles
			Imm.Map(route.Actions).map(function (act, pth) {
				var allowd = act.Doc.Methods,
					denied = HTTPREQ.filter(function (v, i) {
						return allowd.indexOf(v) < 0;
					});
				// Omit Middleware
				if (allowd.indexOf('MIDDLEWARE') < 0) {
					var scheme = ReqPattern(pth, act),
						key = ReqPattern(pth, act, true),
						vld = ReqHandle.Valid(act.Doc.Headers);
					// Handle Badd Requests
						denied.map(function (M) {
							var func = M.toLowerCase(), err = rest.MSG['NO_'+M];
							ReqRoute(router, func, scheme, ReqHandle.Errs(point, err), vld);
						});
					// Handle Good Requests

						// console.log(TLS.Path([name, key]))
						allowd.map(function (M) {
							var func = M.toLowerCase(), prm = rest.PRM[M];
							// console.log(func)
							if (kind == 'AURequest') {
								Socks.push(['Auth', name, pth, key, prm, vld]);
								ReqRoute(router, func, scheme, ReqHandle.Auth(point, pth), vld);
							} else {
								Socks.push(['Data', name, pth, key, prm, vld]);
								ReqRoute(router, func, scheme, ReqHandle.Data(point, pth, prm), vld);
							}
						});
				}
			});

			// Mount Router
				API.use(root, router);
		}

		if (!!routes)
			Imm.Map(routes).map(function (route, name) {
				AddRoute(route, name, kind);
			});
	}
	function AddSpaces (spaces) {

		function AddSpace (name, accessor) {
			accessor = !!accessor;
			/////////////////////////////////////////////////////////////////////////////
			var space = IO.of(name),
				filtr = function (v,i) {
					var key = TLS.Path([v[1], v[3]]),
						pnt = ['/auth/login','/auth/logout'],
						res = (pnt.has(key) == accessor);
					return res;
				};

			/////////////////////////////////////////////////////////////////////////////
			space.on("connection", function (socket) {

				/////////////////////////////////////////////////////////////////////
				// VAR / FUNCTIONS //////////////////////////////////////////////////

					var Req, token, MID = '', SID = '', NID = '', RID,
						authr 	= Create(rest.Points.Auth),
						Init 	= function () {
							// Get Session Data
							Req = socket.request; token = '';
							SID = Req.sessionID; RID = socket.id;
							MID = SID+RID; NID = name+'#'+SID;
							// For General Messages
							LG.Server(SID, 'Session', 'Detaching', 'magenta');
							// Setup the Ednpoints
							Socks.filter(filtr).map(function (v, i) {
								ReqSocket.apply({}, [SID, socket].concat(v));
							});
							// For Auth Messages
							accessor && socket.join(SID);
						},
						Check 	= function () {
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
						socket.on('reload', function () {
							try {
								Req.session.reload( function (err) {
									if (err) { LG.Error(MID, 'Session', 'Reload - ' + err.message); }
									else {	// session updated
										LG.Server(MID, 'Session', 'Reload', 'yellow');
									}
								});
							} catch (e) { LG.Error(MID, 'Session', 'Reload - ' + e.message); }
						});
						// // For Session Regeneration
						// socket.on('regenerate', function () {
							// Req.session.regenerate( function (err) {
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
						socket.on('setup', function () {
							var data; eval('data = '+sobj.Data.toString());
							socket.compress(true).emit('setup', data());
						});
					}

					// General Handles
					socket.on('reconnect_attempt', function (num) {
						LG.Error(MID, 'Session', 'Reconnecting (%d Attempt%s)'.format(num, (num>1?'s':'')));
					});
					socket.on('error', function (err) {
						LG.Error(MID, 'Session', 'Error - ' + err.message);
					});
					socket.on('disconnect', function () {
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
			return function (req, res) {
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
			Imm.Map(spaces).map(function (v,k) {
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
		Init: 		function (api, express, sess, setting) {
			API = api; Express = express; IO = sess.IO; Session = sess;
			Setting = setting; rest.Init(sess);
			API // Main Router Handles
				.use(function (err, req, res, next) {
					// Return 404 for all other requests
					res.status(404).send({ status: 1, request: req.originalUrl, error: err });
				})
				.all("/", ReqHandle.Valid(true), function (req, res) {
					// Configure Main Route
					res.status(200)
					   .send(JSN.Valid(null, rest.Help, {}, {}, 1, 'General Help'));
				});
			// Chain It
			return MAKER.FileRoutes()
						.AuthRoutes(AuthP)
						.DataRoutes( EndP)
						.SiteRoutes();
		},
		FileRoutes: function ( ) { AddFolder(); return MAKER; },
		AuthRoutes: function (P) { AddRoutes(P, 'AURequest'); return MAKER; },
		DataRoutes: function (P) { AddRoutes(P, 'DBRequest'); return MAKER; },
		SiteRoutes: function ( ) { AddSpaces(NMSP); return MAKER; }
	};

	module.exports = MAKER;


/////////////////////////////////////////////////////////////////////////////////////

