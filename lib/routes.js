
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  assert 	= require('assert');
	const  {
		colors, Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
		ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
		ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
		preARGS, Dbg, LG, TLS, JSN, FromJS
	} 				= require('dffrnt.utils');
	const    Pages  = require('../../../main/browser/lib/spaces');
	const  Renders  = require('../../../main/browser/lib/renders').ISO;
	const  { NMSP } = require('dffrnt.confs');
	const  { MSG  } = require('./errors');
	const    REST   = require('./rest');
	const    mime   = require('mime');
	const   moment  = require('moment');
	const   multer  = require('multer');

	const 	SELF 	= this,
			Create 	= Object.create,
			HTTPREQ = ['GET','POST','PUT','DELETE'],
			AuthP 	= REST.Config.AuthP,
			 EndP 	= REST.Config.EndP,
			DFLVLD 	= (req, res, next) => { next(); },
			Socks 	= [],
			Spaces 	= {},
			Folder  = {
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
			storer  = multer.diskStorage,
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
			Setting = {},
			Publics = {},
			Uploads = {};

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
				var THS = this, all = result.all, opt = result.options, 
					bdy = opt.body||{}, qry = opt.query||{}, 
					rec = ((bdy.reqid||qry.reqid)||'receive'),
					ret = { status: THS.statNum, payload: result };
					delete ret.payload.all;

					LG.NOW('\t< REC: %s >', rec);
					// LG.NOW('\t< RET: %s >', JSN.Pretty(ret));

				if (!!!all) { THS.Socket.compress(true).emit(rec, ret); }
				else { THS.Spaces.compress(true).to(THS.SID).emit(rec, ret); }
				LG.Server(THS.MID, 'Session', 'Recieved', 'green');
			}
	}

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE HANDLERS

	function PushRoute (router, request, scheme, handler, limits, validate, upload) {
		let args = [scheme, limits], filt = v=>!!v;
		args = (!!validate ? args.concat([validate]).filter(filt) : args);
		args = (!!upload   ? args.concat([upload  ]).filter(filt) : args);
		args = args.concat([handler]); router[request](...args);
	}
	function SockRoute (...args) { Socks.push(args); }

	function ReqIOID(req) {
		console.log('ReqIOID:', JSON.stringify(req.headers,null,'  '), '\n')

		let cookie = ((req||{}).headers||{}).cookie||'';
		return (cookie.match(/io=(\S+)(?=;|$)/)||[])[1];
	}
	function ReqLog (name, router) {
		LG.IF(`\n\n\n\n${name} |`, router.stack.map((v,i) => {
			let r = v.route, m = Object.keys(r.methods)[0];
			return { [m]: r.path };
		}));
	}
	function ReqClone(socket) {
		let orq = socket.request, srq = {};
		Object.keys(orq).map(k=>(srq[k]=orq[k]));
		return srq;
	}
	function ReqMerge (request, def, req) {
		let srq = request, 
			mrq = Assign({},def,req),
			raw = srq.rawHeaders;
		Imm.Map(mrq).map((v,k) => {
			if (k == 'headers') {
				Imm.Map(v).map((h,n) => {
					let kv = [n,h]; srq.headers[n] = h;
					if (!raw.has(kv)) srq.rawHeaders = raw.concat(kv);
				});
			} else { srq[k] = v; }
		});
		return srq;
	}
	function ReqLoad (loader, store) {
		function SockLoad(req, res, cb) {
			let fls = 	req.files, amt = fls.length, idx = -1,
				hnd = 	function hndStre(req, file, cb) {
							store.getDestination(req, file, (err, destination) => {
								if (err) return cb(err);
								store.getFilename(req, file, (err, filename) => {
									if (err) return cb(err);
									var finalPath = path.join(destination, filename);
									var flebuffer = new Buffer(file.stream);
									fs.appendFile(finalPath, flebuffer, 
										err => !!err ? cb(err) : cb(null, {
											destination: destination,
											filename: 	 filename,
											path: 		 finalPath,
											size: 		 flebuffer
										}))
								});
							});
						},
				fcb = 	function fcb(err) {
							if (err) cb(err);
							else if (idx++,idx>=amt) cb(err);
							else hnd(req, fls[idx], fcb);
						};
			hnd(req, fls[0], fcb);
		}
		return function Upload(req, res, cb) {
			if (!!req.files) SockLoad(req, res, cb);
			else loader(req, res, function (err) {
					if (err) cb(err); else cb();
				});
		}

	}
	function ReqPattern (name, act, noScheme) {
		name = name.toLowerCase();
		var pth = TLS.Path(!!act.Sub ? act.Sub.concat(name) : [name]),
			sch = (!!!noScheme ? (act.Scheme || '/') : '/');
		return TLS.Concat(pth.toLowerCase(), sch);
	}
	function ReqSocket (action, path, key, limits = [], validation, upload, scheme) {
		var key = TLS.Path([action, key]),
			pnt = REST.Points[action],
			hnd = ReqHandle.Main(pnt, path),
			err = ReqHandle.Errs(pnt, MSG.BAD_REQ),
			def = { originalUrl: key,   headers: {},
					params: {}, body: {}, query: {}},
			chk = limits.concat(validation?[validation]:[])
						.concat(upload?[upload]:[])
						.filter(v=>!!v)
						.concat([function run(req, res) { 
							let url = def.originalUrl,
								prm = Object.values(req.params).join('/'),
								sch = `${url}/${prm}`,
								mch = sch.match(scheme);
							switch (!!mch) {
								case  true: hnd(req, res); break;;
								case false: err(req, res); break;; 
							}
						}]),
			nxt =(req,res)=>{
				let idx = -1; 
				(function next() {
					idx++; chk[idx](req, res, next)
				})()
			};
		// ---------
		return function ReqRocket(socket) {
			let res = new SocketRes(socket);
			socket.removeAllListeners(key);
			socket.on(key, req => nxt(
				ReqMerge(ReqClone(socket), 
				def, req), res));
			return key;
		}
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

	const 	ReqSession	= {
				LogErr		(name, err) {
					LG.IF(`ERROR | ${name} |`, err);
				},
				Save 		(req, data = {}) { 
					let THS = this; try {
						let sess = req.session, user = sess.user||{};
						sess.cookie.maxAge = Session.Cookie.Age.In;
						sess.user = Assign(user, data||{});
						sess.touch(); sess.save();
					} catch(e) { THS.LogErr('Save',e); } 
				},
				Renew  	  	(req, data = {}) {
					let THS = this; try { 
						let SESS = Session, SS = req.session, EX = SS.cookie.maxAge;
						if ( EX / SESS.Cookie.Age.In <= 0.20 ) this.Save(req, data);
					} catch (e) { THS.LogErr('Renew',e); }	
				},
				Reload 		(req) {
					let THS = this; 
					return new Promise((resolve, reject) => {
						try {
							let sid  = req.sessionID,
								user = req.session.user,
								acct = user.acct;
							req.session.reload(err => {
								LG.Server(sid, 'SESSION', `Reloaded < ${acct} >`, 'yellow');
								if (!!err) reject(err);
								else resolve(true);
							});
						} catch (e) { THS.LogErr('Reload',e); }
					})
				},
				Regenerate 	(req) {
					let THS = this; 
					return new Promise((resolve, reject) => {
						let sid  = req.sessionID,
							sess = req.session||{},
							user = sess.user||{acct:'none'},
							body = req.body||{},
							acct = user.acct;
						try { req.session.regenerate(err => {
							LG.Server(sid, 'SESSION', `Regenerated < ${acct} >`, 'red');
							if (!!err) reject(err);
							else resolve([
								MSG.RESTORED.temp, 
								user, null, body
							]);
						}); } catch (e) { THS.LogErr('Regenerate',e); }
					})
				},
				Destroy 	(req) {
					let THS = this; try {
						delete req.session.user; 
						req.session.save();
					} catch (e) { THS.LogErr('Destroy',e); }
				},
				Sanitize 	(req,ret,usr,bdy) { 
					try{delete req.body.username;}catch(e){}
					try{delete req.body.password;}catch(e){}
					// -------------------------------------------------------------
					try{delete bdy.reqid;}catch(e){}
					try{delete bdy.username;}catch(e){}
					try{delete bdy.password;}catch(e){}
					// -------------------------------------------------------------
					try{delete usr.Scopes.user_pass;}catch(e){}
					try{delete req.session.user.Scopes.user_pass;}catch(e){}
					try{delete ret.payload.result.user.Scopes.user_pass;}catch(e){}
				},
			};
	const 	ReqHandle 	= {
				Check (redirect = {}) {
					let NEXT = (res, stat, err, ret, next) => {
						let action = redirect[!!stat];
						if (!!!action) next(null,ret);
						else res.redirect(301,action);
					};
					return function Check(req, res, next) {
						Promise.resolve((async (req, res, next) => {
							let ret = await REST.Remote.MID(
										'/auth/check', {}, {}, {
											headers: 	req.headers,
											session: 	req.session,
											sessionID: 	req.sessionID,
											cookies: 	req.cookies,
										}),	
								pay = ret.payload,
								usr = pay.result.user;
							// Renew Session
							ReqSession.Renew(req);
							// Sanitize Request
							ReqSession.Sanitize(req, ret);
							// Hydrate Request
							req.headers.token = usr.Token;
							req.profile = usr;
							// Continue
							NEXT(res, 1, null, ret, next);
						})(req, res, next)).catch(err=>{
							// console.log('CHKERR :', JSN.Pretty(err))
							NEXT(res, 0, err, null, next);
						});
					};
				},
				Valid (headers) {
					let validate = (headers == true || 'token' in (headers||{}));
					return (validate ? function Validate(req, res, next) {
						Promise.resolve((async (req, res, next) => {
							let ret = await REST.Remote.MID(
										'/auth/validate', 
										{}, req.body, {
											headers: 	req.headers,
											session: 	req.session,
											sessionID: 	req.sessionID,
											cookies: 	req.cookies,
										}),
								pay = ret.payload,
								nxt = pay.result.next;
							// Renew Session
							ReqSession.Renew(req, nxt[0]);
							// Sanitize Request
							ReqSession.Sanitize(req, ret);
							next(null, ret);
						})(req, res, next)).catch(e=>(
							console.log('VLDERR:', JSN.Pretty(e)),
							next(e)
						));
					} : DFLVLD);
				},
				Limit (kind,limiter,point,key,path) {
					let HND = point.Limit.bind(point),
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
				Upload(method, files) {
					if (!['PUT','POST'].has(method)||!!!files||!!!Uploads) return null;
					// ---------------------------------------------------------
					let fold = 	Uploads.Folder,
						kind =  (files.max>1?'array':'single'),
						fdst =  (files.dest||((prm, bdy, file) => '')),
						fnme =  (files.name||((prm, bdy, file) => file.originalname)),
						stre = 	storer({
									destination: function (req, file, cb) {
										let prm = req.params, bdy = req.body,
											dst = fdst(prm, bdy, file),
											dir = fold.path(dst);
										fs.mkdir(dir, 755, err=>cb(null, dir));
										req.body.location = dst;
									},
									filename: function (req, file, cb) {
										let prm = req.params, bdy = req.body,
											nme = fnme(prm, bdy, file);
										req.body[files.field] = nme; cb(null, nme);
									}
								}),
						mult = 	multer({ storage: stre }),
						load = 	mult[kind](files.field, files.max);
					return ReqLoad(load, stre);
				},
				Errs  (point, err) {
					return (req, res) => {
						point.Error(req, res, err);
					};
				},
				Main  (point, path) {
					let SR = 'ServerResponse';
					switch (point.constructor.name) {
						case 'AURequest': 
							let Main = async (req, res, nxt) => {
								let kind  = res.constructor.name,
									url   = `${point.NME}/${path}`.toLowerCase(),
									route = point, exc = route[path];
									req.query.path = url;
								try {
									let { send, next } = await exc(req,res,nxt);
									// Sanitize
									if (['Login','Logout'].has(path)) {
										ReqSession.Sanitize({},{},send[1],send[3]);
										send[3].path = url;
									}
									// Reply
									if (kind == SR) {
										ReqSession[next[0]](req,next[1]);
										route.OK(res, ...send);
									} else route.OK(res, ...Assign(
										new Array(6).fill(null), 
										send, [,,,,,next]
									));
								} catch (rerr) { 
									route.ER(res, ...rerr); 
								};
							};	return Main;
						default: 
							return async (req, res) => { 
								let route = point, exc = route[path];
								req.query.path = req.originalUrl; 
								try {
									let [err,itms,opts] = await exc(req);
									// ---------------------------------------------
									async function doLinks(items,meta) {
										// -----------------------------------------
										function runLinks(links) {
											let prom = async v => { try {
													let S = v.replace(/SocketLink/,''),
														O = JSON.parse(S), 
														Q = O.point,
														R = {
															params: O.params||{},
															query: 	O.query	||{},
															body: 	O.body	||{},
															files: 	O.files	||[] },
														P = {
															true:  ()=>Q.slice(-1)[0].toTitleCase(),
															false: ()=>'/' }[Q.length>1](),
														A = Q[0].toTitleCase(),
														E = REST.Points[A][P],
														err,itms,opts;
													// --------------------------------
													[err,itms,opts] = await E(R);
													itms = await doLinks(itms,opts);
													return FromJS(Assign({},itms));
												} catch (e) { return e; } };
											return Promise.all(links.toArray().map(prom));
										};
										// -----------------------------------------
										try {
											let   omits = (v,k)=>!['prev','next'].has(k),
												{ query, body } = meta.Options,
												gtLnk = L=>(typeof(L)=='string'?JSON.parse(L):L),
												doLnk = gtLnk((query||body).links||false),
												filtr = {
													'array': (v,k)=>doLnk.has(k),
													'boolean': ()=>true,
												}, lnks, othr;
											// -----------------------------------------
											if (!!items && !!doLnk) {
												lnks  = Imm	.Map(meta.Links)
															.filter(filtr[ISS(doLnk)])
															.filter(omits);
												if (lnks.size) {
													othr  = await runLinks(lnks);
													items = othr.reduce(
																(R,V)=>R.mergeDeep(V), 
																FromJS(Assign({},items))
															).toJS();
											}	}; 	return 	items;
										} catch(e) {
											console.log('LERR:', e, '\n')
											console.log(
												req.originalUrl,
												JSON.stringify({ 
													items: items, meta: meta 
												}, 	null, '  '),
												'\n'
											);	return [];
										}
									}; 	itms = await doLinks(itms,opts);
									// --------------------------------------------
									route.SN(res, err||itms, opts);
								} catch (e) {
									console.log('MAIN ERR:', e)
									route.Error(res, ...e);
								};
							};
					}
				},
			};

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE CONFIGURATION

	// Endpoints for when the browser is requesting /{{folder}}/*.*
	function AddFolder (folders) {
		if (!!!folders) return false; // Abort, if needed.

		let FKEYS = Object.keys(Folder),
			IFOLD = Imm.fromJS(Folder),
			FMRGE = (o,n) => n||o,
			FPROP = (v,k) => FKEYS.has(k),
			FLDRS = Imm.Map(folders).map((v,k) => {
				let FLD = 	IFOLD.mergeDeepWith(FMRGE,Imm.Map(v).filter(FPROP)).toJS(),
					FHD = { 'Cache-Control': `public, max-age=${FLD.Age}` };
				FLD.Folder  = new FOLDER(FLD.Folder, FLD.Age);
				/////////////////////////////////////////////////////////////////////////////
				var pub = Express.Router(), name = FLD.Folder, mch = FLD.Matcher,
					hnd = (req, res) => {
						var url = req.url, fle = url.replace(mch, ''),
							pth = name.path(fle), sid = req.sessionID;
						res.header(FHD);
						res.status(200).sendFile(pth, {}, e => {
							if (!!e) { res.status(e.status).end(); }
							else { LG.Server(sid, 'EXTERNAL', fle, 'magenta'); }
						});
					};
				/////////////////////////////////////////////////////////////////////////////
				pub.get('/', (req, res) => { res.status(403).send('Nope...'); });
				/////////////////////////////////////////////////////////////////////////////
				pub.get('/*', hnd); pub.post('/*', hnd);
				API.use(name.root, pub); return FLD;
			}).toObject();

		Publics = FLDRS.Publics||{};
		Uploads = FLDRS.Uploads||{};
	}
	// Endpoints for when an API is accessed 
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
						denied = HTTPREQ.filter((v,i)=>allowd.indexOf(v)<0),
						isMdle = allowd.has('MIDDLEWARE');
					// Omit Middleware
						let scheme 	= ReqPattern(pth, act),
							key 	= ReqPattern(pth, act, true),
							dir 	= `${root}${ReqPattern(pth, act, true)}`,
							lmt 	= ReqHandle.Limit('endp',limiters.root, point, pth, dir),
							vld 	= !isMdle ? ReqHandle.Valid(act.Doc.Headers) : null;

						// Handle Douchebag Requests
							!isMdle && denied.map(M => {
								let func = M.toLowerCase(), err = MSG['NO_'+M];
								PushRoute(router, func, scheme, ReqHandle.Errs(point, err), lmt, vld);
							});
						// Handle Good-Guy Requests
							allowd.map(M => {
								let func = 	M.toLowerCase(),
									main = 	ReqHandle.Main(point, pth),
									upld =	ReqHandle.Upload(M,act.Doc.Files),
									schm = 	new RegExp([
												name.toLowerCase(),
												scheme.slice(1,-1)
													.replace(/\/{2,}/g,'')
													.replace(/([^\\])\//g,'$1\\/')
													.replace(/(^|[\/(]|[|]):\w+(?=[(])/g,'$1')
													.replace(/^(.+)$/,'(?:$1)')
											].join('\\/'));
								// ----
								SockRoute(name, pth, key, lmt, vld, upld, schm); 	// Socket
								!isMdle && PushRoute(
									router, func, scheme, main, lmt, vld, upld		// HTTP
								);
							});
						// Handle Documentation (sub)
							!isMdle && PushRoute(
								hroute, 'all', key, ReqHandle.Errs(point, pth), hlimit, vld
							);
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
	// Endpoints for when API documentation is requested or during API errors
	function AddDocuments () {
		// Create Helpdoc Route
		HLP .all("/", ReqHandle.Valid(true), GetHelp);
		API .use('/docs', HLP);
	}
	// Endpoints for when the API is accessed via Sockets
	function AddSpaces (spaces) {

		function AddSpace (name, accessor) {
			accessor = !!accessor;
			/////////////////////////////////////////////////////////////////////////////
			let url   = `/${name}`,
				space = IO.of(url),
				globl = name.match(/^gbl-/),
				epnts = [],
				hndls = Socks.filter(v => {
							var key = TLS.Path([v[0], v[2]]),
								mch = !!key.match(/^\/auth\//),
								res = (mch == accessor);
							!!res && epnts.push(key); return res;
						})
						.map(v => { let a = v.slice();
							// Remove checks/limits for System API, if needed
							globl && (a[3] = [],a[4] = null);
							// Create Routers for Socket User
							return ReqSocket(...a);
						});

			/////////////////////////////////////////////////////////////////////////////
			space.on("connection", socket => {

				/////////////////////////////////////////////////////////////////////
				// VAR / FUNCTIONS //////////////////////////////////////////////////

					let Req, token, MID = '', SID = '', NID = '', RID, Checker = ReqHandle.Check(),
						LGMSG 	= 	(kind,err,msg)=>[kind,msg||(err||{}).message].filter(v=>!!v).join(' - '),
						LGERR	= 	(kind,err,clr='red')=>LG.Error(MID,'Session',LGMSG(kind,err),clr),
						LGSRV	= 	(kind,clr='yellow')=>LG.Server(MID,'Session',kind,clr),
						Init 	= 	() => {
							// Get Session Data
							Req = socket.request; token = '';
							SID = Req.sessionID; RID = socket.id;
							MID = SID+RID; NID = url+'#'+SID;
							// For General Messages
							LG.Server(SID,'Session','Detaching', 'magenta');
							// Setup the Ednpoints
							hndls.map(v => v(socket));
							// For Auth Messages
							/* !globl &&  */accessor && socket.join(SID);
						},
						Check 	= 	() => {
							if (!globl && accessor) {
								LGSRV('Checking', 'blue');
								let Res = new SocketRes(socket);
								Checker(Req,Res,(err,ret)=>{
									if (!!!(err||ret)) return;
									let { status, payload } = (err||ret);
									delete payload.options.body.reqid;
									Res.status(status).send(payload);
								});
							}
						},
						Sessers = 	(sync = 1, key, post = (()=>true)) => {
							socket.on(key, (!!!sync ?
								async (data = {}) => { try { 
									await ReqSession[key](Req, data); LGSRV(key); post(); }
									catch(err) { LGERR(key, err); } 
								} :   (data = {}) => { 
									try { ReqSession[key](Req, data); LGSRV(key); post(); }
									catch(err) { LGERR(key, err); } 
								}));
						};

				/////////////////////////////////////////////////////////////////////
				// HANDLERS /////////////////////////////////////////////////////////

					// Remove Stale Listeners
						socket.removeAllListeners('Save');
						socket.removeAllListeners('Renew');
						socket.removeAllListeners('Reload');
						socket.removeAllListeners('Regenerate');
						socket.removeAllListeners('Destroy');
						socket.removeAllListeners('reconnect_attempt');
						socket.removeAllListeners('error');
						socket.removeAllListeners('disconnect');

					// Determine Socket's Intention
						if (!globl) {
							if (accessor) {
								// For Session Renewing
								Sessers( true, 'Save');
								// For Session Renewing
								Sessers( true, 'Renew');
								// For Session Reloading
								Sessers( true, 'Reload');
								// For Session Regeneration
								Sessers(false, 'Regenerate', Init);
								// For Session Destroying
								Sessers( true, 'Destroy');
							} else {
								// For Broadcasting End-Points to Client
								let sobj = Pages[name], dobj = Pages['default'],
									head = socket.handshake.headers, 
									host = head.host, refr = head.referer,
									regx = `^https?:\/{2}${host}(\/.+)$`,
									path = refr.replace(new RegExp(regx),"$1"),
									LKID = ReqIOID(socket.request),
									LOKR = Session.Stores.Lockers;
								// -------------------------------------------------------
								if (!!!sobj) sobj = dobj;
								sobj.Data  = (sobj.Data ||dobj.Data );
								sobj.Build = (sobj.Build||dobj.Build);

								var send = res => (
										socket.compress(true).emit(
											'build', (JSON.parse(res)||[{}])[0]
									)	);

								// -------------------------------------------------------
								function Builder() {
									LOKR.get(LKID,(err,res)=>send(res||{}));
								}
								// -------------------------------------------------------
								socket.on('setup', Builder);
							}
						} else {
							socket.emit('points', epnts);
						}

					// General Handles
						socket.on('reconnect_attempt', num => {
							LGERR('Reconnecting', {message:'%d Attempt%s'.format(num,(num>1?'s':''))});
						});
						socket.on('error', err => LGERR('Error', err));
						socket.on('disconnect', () => LGERR('Disconnected'));

				/////////////////////////////////////////////////////////////////////
				// SETUP ////////////////////////////////////////////////////////////

					// Log the Connection
					Init(); LGSRV('Connected');
					// Check if Authorized
					!globl && Check();

			}); return space;
		}

		function AddSite  (space) {
			let refl =  'route.js | AddSpaces.AddSites |',
				cnfg = 	space.config,
				regx = 	{
					spce: 	/((?:<\w+\b|[\w=]+=(["']).+?\2(?=\s|)) )[\s\n]+/g,
					nwln:	/\n+\t*/g,
					scss: 	/^.+<!-{2}[{]{2}CSS[}]{2}-{2}>.+$/gm,
					vars: 	/<!-{2}[{]{2}([A-Z]+)[}]{2}-{2}>/g,
					objs: 	/\{\/\*!- CONFIG -\*\/\}/g,
					lckr: 	/\/\*!- LOCKER -\*\//g,
					styl: 	/\/\*!- STYLES -\*\//g,
					html: 	/<!-{2}CONTENT-{2}>/g,
					clsr:	/\/>/g,
					quot:	/&#x27;/g,
					plce: 	/-{2}[{]{2}([A-Z.]+)[}]{2}-{2}/g,
				},
				repl = 	(rnd, lid, cfg) => ({
					spce:	'$1',
					nwln:	'',
					scss:   ($0 => cfg.page.CSS.map(C =>
								$0.replace(/<!-{2}[{]{2}CSS[}]{2}-{2}>/g, C)
							).join('\n')),
					vars: 	($0, $key) => (cfg[$key.toLowerCase()]||''),
					objs: 	($0 => JSON.stringify(cfg||{})),
					lckr: 	($0 => lid),
					styl: 	($0 => cfg.page.styles?(rnd.Styles||''):''),
					html: 	($0 => rnd.HTML||''),
					clsr:	'>',
					quot:	"'",
					plce: 	(usr => ($0, $key) => { try { 
								let key = $key.toTitleCase(),
									val = `usr.Profile.${key}`;
								return eval(val); 
							} catch (e) { return ''; }; }),
				}),
				sani = 	(mark, data) => mark
							.replace(regx.spce,data.spce)
							.replace(regx.nwln,data.nwln)
							.replace(regx.scss,data.scss)
							.replace(regx.vars,data.vars)
							.replace(regx.objs,data.objs)
							.replace(regx.lckr,data.lckr)
							.replace(regx.styl,data.styl)
							.replace(regx.html,data.html)
							.replace(regx.clsr,data.clsr)
							.replace(regx.quot,data.quot),
				mkup =  '',
				head = 	{
					'Content-Type':  'text/html',
					'Cache-Control': 'no-cache', // `public, max-age=${Publics.Age}`
				},
				LOKR = Session.Stores.Lockers;
			// -----------
			fs.readFile(Publics.Folder.index, 'utf8', (err,mark) => {
				if (err) return LG.Error(err);
				mkup = mark;
				// html = ''; // sani(mark, repl(hrnd));
				// atml = sani(mark, repl(arnd));
			});
			// -----------
			return function AddingSite(req, res) {
				let  path = req.originalUrl,
					 host = req.headers.host,
					 ptcl = req.protocol;
				cnfg.host = `${ptcl}://${host}`;
				LG.Timed(()=>{
					let ctn, rnd, rep, call,
						lid = ReqIOID(req),
						usr = req.profile, 
						cfg = Imm.fromJS(cnfg).toJS(), 
						ttl = (pay)=>(
							cfg.title = cfg.page.title(path,usr,pay),
							rnd.Auth(cfg.title)
						);

						console.log('AddingSite.LID:', lid, JSON.stringify(req.headers,null,'  '), '\n')

					delete req.profile; 
					rnd = Renders(global,cfg,REST,usr,path);
					res.header(head);
					if (!!rnd.Call) {
						let { params, query, body, files } = req;
						call  = rnd.Call(path,params,query,body,files,usr);
						REST.Remote[call.method](
							call.path, 
							call.params,
							call.query||call.body, 
							call.files
						).then(ret => {
							let pay = ret.payload.result; ttl(pay);
							// ------
								try { rnd.HTML = rnd.Render(pay); } 
								catch(e) { console.log('RNDR ERR:',e); }
								rep = repl(rnd, lid, cfg);
								ctn = sani(mkup, rep);
								res.status(200).send(ctn);
							// ------
								LOKR.set(
									lid, JSON.stringify([rnd.Build(pay)]), 
									'EX', 300, (err,stat)=>
										LG.NOW(`${refl} CALL CACHED:`, stat));
						}).catch(err => { 
							console.log(
								`${refl} CALL CACHE ERROR:`, 
								JSON.stringify(err,null,'    '),
								'\n');
							!!rnd.Redirect && 
								res.redirect(301,rnd.Redirect);
						});
					} else {
						ttl(); rnd.HTML = rnd.Render();
						rep = repl(rnd, lid, cfg);
						ctn = sani(mkup, rep);
						LOKR.set(
							lid, JSON.stringify([rnd.State]), 'EX', 300, 
							(err, stat) => {
								if (!!err) console.log(
									`${refl} CACHE ERROR:`, 
									JSON.stringify(err,null,'    ')
								);
								else console.log(`${refl} CACHER:`,stat,'\n');
							}	);
						res.status(200).send(ctn);
					}
				},	req.sessionID, 'EXTERNAL', req.url, 'magenta');
			};
		}

		// Configure Socket-Routes
			let spaceLog = (nme, dsc = '', kind = 'normal') => {
					let msf = 'An Application for %s', nmf = '%15-s',
						name = nmf.format(nme), opts = [];
					switch (kind) {
						case 'global': opts = ['^^^^^', 'blue']; break;;
						case 'render': opts = ['Rendered', 'magenta']; break;;
						case 'normal': opts = [msf.format(dsc), 'gray']; break;;
					};
					LG.Server(name, 'NameSpace', ...opts);
				};
			// Initialize the Custom Namespaces, if available
			if (!!spaces) {
				let GBL = spaces.Global, EXPOSES = GBL.expose,
					PASS = (res,req,next)=>(next());

				Imm	.OrderedMap(spaces)
					.filter((v,k)=>k!='Global'&&v.config.name!='global')
					.map((v,k) => {
						let c = v.config,
							nme = c.name,
							dsc = c.description,
							acc = c.accessor,
							stc = c.restrict,
							sch = c.scheme,
							url = `/${nme}`,
							gbl = EXPOSES.has(nme);
						// Create Socket Space
						Spaces[k] = AddSpace(nme, acc); spaceLog(nme, dsc);
						// Handle Globals, Accessors, Sites
						switch (true) {
							// Setup any Global Namespaces
							case gbl: 	let gme = `gbl-${nme}`; 
										Spaces[k] = AddSpace(gme, acc);
										spaceLog(gme, '', 'global');;
							// This sets any Accessors
							case acc: 	Session.Accessor = Spaces[k]; break;;
							// This handles the NameSpace Sites
							default: 	let rou = Express.Router(), ste = AddSite(v), 
											chk = ReqHandle.Check(stc);
										rou .get('/', chk, ste); rou.post('/', chk, ste);
										API.use(!!sch?sch:url, rou); 
										spaceLog(nme, '', 'render');
						}
				});
			// Otherwise, add placeholder NameSpace
			} else { Spaces.Index = AddSpace('/'); };
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
					let MK=MAKER.FileRoutes(Setting.Folders)
								.AuthRoutes(AuthP)
								.DataRoutes( EndP)
								.HelpRoutes()
								.SiteRoutes();
					// ------
					return MK;
				},
				FileRoutes: function FileRoutes(P) { AddFolder(P); return MAKER; },
				AuthRoutes: function AuthRoutes(P) { AddRoutes(P, 'AURequest'); return MAKER; },
				DataRoutes: function DataRoutes(P) { AddRoutes(P, 'DBRequest'); return MAKER; },
				HelpRoutes: function HelpRoutes( ) { AddDocuments( ); return MAKER; },
				SiteRoutes: function SiteRoutes( ) { AddSpaces(NMSP); return MAKER; },
			};

	module.exports = MAKER;

/////////////////////////////////////////////////////////////////////////////////////

