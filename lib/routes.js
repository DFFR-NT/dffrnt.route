
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  assert 	= require('assert');
	const  {
		colors, Assign, Imm, StrTime, ROOTD, LJ, path, os, fs,
		CNAME, ARGS, TYPE, EXTEND, HIDDEN, DEFINE, NIL, UoN, IaN, IS,
		ISS, OF, FOLDER, DCT, RGX, FRMT, CLM, CLMNS, ELOGR,
		preARGS, Dbg, LG, TLS, JSN, FromJS
	} 				= require('dffrnt.utils');
	const  Browser  = '../../../main/browser/lib';	
	const BrowPath  = path.resolve(__dirname, Browser);
	const BrowExist = fs.existsSync(BrowPath);
	const    Pages  = BrowExist ? require(`${Browser}/spaces`) : {};
	const  Renders  = BrowExist ? require(`${Browser}/renders`).ISO : null;
	const  { NMSP } = require('dffrnt.confs').Init();
	const  { MSG  } = require('./errors');
	const    REST   = require('./rest');
	const    mime   = require('mime');
	const   moment  = require('moment');
	const   multer  = require('multer');
	const    UTL    = require('util');

	const 	 VM 	= require('vm');
	const { 
		NodeVM:   VM2, 
		VMScript: VMS 
	}	= require('vm2');

	const 	HTTPREQ = ['GET','POST','PUT','DELETE'],
			/** 
			 * @typedef  {Object}  METHOD_MAP 
			 * @property {"query"} METHOD_MAP.GET
			 * @property {"body"}  METHOD_MAP.PUT
			 * @property {"body"}  METHOD_MAP.POST
			 * @property {"body"}  METHOD_MAP.DELETE
			 * @property {"body"}  METHOD_MAP.MIDDLEWARE
			 * @constant
			 */
			METHOD_MAP = {
				GET: 'query', 
				PUT: 'body', 
				POST: 'body',
				DELETE: 'body', 
				MIDDLEWARE: 'body'
			},
			DFLVLD 	= (req, res, next) => { next(); },
			Socks 	= [],
			Spaces 	= {},
			Sites 	= {},
			RDFL 	= UTL.promisify(fs.readFile),
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

	// Class.Isolate ////////////////////////////////////////////////////////////////////////

		/**
		 * Runs a script in an Isolated Environment
		 */
		class Isolate {
			/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

				/**
				 * Creates an instance of `Isolate`.
				 * @param {string} code The full _code_ or _path_ of the **script**
				 * @param {Object<string,any>} [sandbox={}] An `Object` representing the `global` namespace
				 * @param {boolean|string[]} [external=true] `true`, or an `array` of allowed **external** `modules`
				 * @param {string[]} [builtin=['*']] An `array` of allowed **builtin** `modules`
				 */
				constructor(code, sandbox = {}, external = true, builtin = ['*']) {
					let RGX = /^((?:[^\s\/]+\/)*[^\s\/]+\.js)$/,
						THS = this, Path, Script, Sandbox;
					// -----
					if (!!code.match(RGX)) {
						Path   = path.resolve(__dirname, code);
						Script = fs.readFileSync(Path,{encoding:'utf8'});
					} else {
						Path   = path.resolve(__dirname, 'code.js');
						Script = code;
					}
					// -----
					Sandbox = new VM2({
						context: 'sandbox',
						sandbox:  sandbox,
						// nested:	  true,
						// wrapper: 'none',
						require: {
							external: external,
							builtin:  builtin,
						},
					});
					// -----
					DEFINE(THS, {
						run: HIDDEN(function run() { 
							return Sandbox.run(Script, Path); 
						})
					});
				}
		};

	// Class.SocketRes //////////////////////////////////////////////////////////////////////
		
		/**
		 * A `Response Object` for `Socket.IO` sessions
		 */
		class SocketRes {
			/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////

				/**
				 * Creates an instance of SocketRes.
				 * @param {WebSocket} Socket
				 */
				constructor(Socket) {
					var THS  = this, req = Socket.request, sess = req.session;
					THS.Socket = Socket; THS.Spaces = Socket.nsp; THS.link = {}; THS.statNum = 200;
					THS.SID = req.sessionID; THS.RID = Socket.id; THS.MID = THS.SID+THS.RID;
					THS.connection = THS.Socket.conn;
				}

			/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

				/**
				 * Sets any `query links` for this `Response`
				 * @param {Object<string,string>} links An `Object Literal` of `SocketLinks`
				 * @returns {this}
				 */
				links  	( links) { this.link = Assign({}, this.link, links); return this; }
				/**
				 * Sets the `HTTP` status of this `Response`
				 * @param {Number} status The `HTTP` status code
				 * @returns {this}
				 */
				status  (status) { this.statNum = status; return this; }
				/**
				 * Sends the `Response` to the requesting `Client`
				 * @param {Object<string,any>} result
				 */
				send  	(result) {
					var THS = this, all = result.all, opt = result.options, 
						bdy = opt.body||{}, qry = opt.query||{}, 
						pth = (bdy.path||qry.path), drc = 'receive',
						ret = { status: THS.statNum, payload: result },
						rec = ((bdy.reqid||qry.reqid)||drc); 
						delete ret.payload.all;
					if (!!!all) { THS.Socket.compress(true).emit(rec, ret); }
					else { THS.Spaces.compress(true).to(THS.SID).emit(rec, ret); }
					LG.Server(THS.MID, 'Session', pth, 'green');
				}
		}

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE HANDLERS

	function PushRoute (router, request, scheme, handler, limits, validate, upload) {
		return router[request](...([
			scheme, limits,
			...([validate]||[]),
			...([upload]||[]),
			...[handler],
		].filter(v=>!!v)));
	}
	function SockRoute (...args) { Socks.push(args); }

	function ReqIOID(req) {
		// console.log('ReqIOID:', JSON.stringify(req.headers,null,'  '), '\n')
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
	function ReqMerge (request, def, req, pscheme) {
		let srq  = 	request, 
			mrq  = 	Assign({},def,req),
			raw  = 	srq.rawHeaders,
			prm  = 	Imm.Map(req.params||{}),
			orl  = 	pscheme,
			url  = 	prm.reduce((a,v,p)=>(a.replace(
						new RegExp(
							`(?:\\/[{][^{}]*(\\b${p}\\b)[^{}]*[}])(?=\\/|$)`,
						'g'), `\/${v}`
					)),	orl).replace(/\/\{\}/g);
		Imm.Map(mrq).map((v,k) => {
			if (k == 'headers') {
				Imm.Map(v).map((h,n) => {
					let kv = [n,h]; srq.headers[n] = h;
					if (!raw.has(kv)) srq.rawHeaders = raw.concat(kv);
				});
			} else { srq[k] = v; }
		});
		srq.actualUrl = url;
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
	function ReqPatternFactory (patterns) {
		function Sanitize(path, params = []) {
			path = (path||''); params = (params||{});
			let rgx = /[/|]+:(\w+)[(].+?[)](?:(?=[)\/|])|$)/g,
				rep = ($0,$1)=>(params.has($1) ? $0 : '');
			return path .replace(/^\/+((?!=\/).*[^\/])\/+$/,'$1')
						.replace(/^\\+$/,'')
						.replace(rgx,rep);
		}

		return function ReqPattern (name, act, method, noScheme = false) {
			let mth, pth, sch, sub, mmd, prm;
			name = name.toLowerCase(); noScheme = !!noScheme; mth = (act[method]||{});
			// Merge Patterns; if needed
			if (!!patterns && !!mth.Merge) {
				mmd = (mth.Merge===true?method:mth.Merge);
				// Collect Path Params
				prm = Object.keys(mth.Params).map(p=>p.toLowerCase());
				// Get Sub-Paths
				sub = ['/'].concat(act.Sub||[]).reduce((a,p)=>(
					a.concat([Sanitize(p,prm),Sanitize(patterns[p][mmd],prm)])
				), 	[]).filter(p=>!!p);
			} else { sub = act.Sub; }
			// Add to Patterns Collection
			if (!!method) {
				if (!!!patterns[name]) patterns[name] = {};
				patterns[name][method] = mth.Scheme;
			}
			// Build the Scheme
			pth = TLS.Path(!!sub ? sub.concat(name) : [name]);
			sch = (!noScheme ? (mth.Scheme||'/') : '/');
			// Return
			return TLS	.Concat(pth.toLowerCase(), sch)
						.replace(/%5c/g,'\\')
						.replace(/%5b/g,'[')
						.replace(/%5d/g,']');
		};
	}
	function ReqSocket (action, key, path, limits = [], validation, upload, scheme) {
		var sch = scheme,
			key = TLS.Path([action, key]),
			pnt = REST.Points[action],
			hnd = ReqHandle.Main(pnt, path),
			err = ReqHandle.Errs(pnt, MSG.BAD_REQ),
			def = { originalUrl: key, 
					headers: 	{},
					params: 	{}, 
					body: 		{}, 
					query: 		{}
				},
			chk = limits.concat(validation?[validation]:[])
						.concat(upload?[upload]:[])
						.filter(v=>!!v)
						.concat([function run(req, res) { 
							// console.log(`oURL: ${req.actualUrl} (${key}) [${sch.matcher}]`)
							let url = req.actualUrl, mch = url.match(sch.matcher);
							switch (!!mch) {
								case  true: hnd(req, res); break;;
								case false: err(req, res); break;; 
							}
						}]),
			nxt = (req, res) => {
				let idx = -1; 
				(function next(e) {
					if (!!e) return res.status(e.status).send(e.payload);
					idx++; chk[idx](req, res, next)
				})()
			};
		// ---------
		return function ReqRocket(socket) {
			let res = new SocketRes(socket);
			socket.removeAllListeners(key);
			socket.on(key, req => (
				// key == '/user' && 
					// console.log('SID:', socket.id),
				nxt(ReqMerge(
					ReqClone(socket), 
					def, req, sch.template
				), res))
			);
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

	function ReqDataPath(req) {
		req[METHOD_MAP[req.method]].path = req.originalUrl;
	}

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
							console.log('CHKERR :', JSN.Pretty(err), req.sessionID)
							NEXT(res, 0, err, null, next);
						});
					};
				},
				Valid (headers) {
					let validate = (headers===true||!!Object.keys(headers||{}).length);
					return (validate ? function Validate(req, res, next) {
						Promise.resolve((async (req, res, next) => {
							let ret = await REST.Remote.MID(
										'/auth/validate', {}, { 
											...(req.query||{}),
											...(req.body ||{}), 
											_for: req.originalUrl
										}, {
											headers: 	req.headers,
											session: 	req.session,
											sessionID: 	req.sessionID,
											cookies: 	req.cookies,
										}),
								pay = ret.payload,
								opt = pay.options,
								wch = !!req.body?'body':'query',
								bdy = opt.body,
								nxt = pay.result.next;
							// Renew Session
							ReqSession.Renew(req, nxt[0]);
							// Sanitize Request
							ReqSession.Sanitize(req, ret);
							// Hydrate Request
							delete bdy._for;
							req[wch] = { ...req[wch], ...bdy }; 
							// Perform Request
							next(null, ret);
						})(req, res, next)).catch(e=>(
							console.log('VLDERR:', JSN.Pretty(e)),
							// next(e)
							res.status(e.status).send(e.payload)
						));
					} : DFLVLD);
				},
				Limit (kind,limiter,point,key,method,path) {
					let HND = point.Limit.bind(point),
						PTH = path.replace(/[/]+$/,''),
						RQL = (!!key&&((point.Requests.get(key)||{})[method]||{}).Limits||[]),
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
								let route = point, 
									meth  = req.method,
									kind  = res.constructor.name,
									url   = `${route.NME}/${path}`.toLowerCase(),
									exc   = route[path][meth];
									ReqDataPath(req);
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
								let route = point, 
									meth  = req.method,
									exc   = route[path][meth];
									ReqDataPath(req);
								try {
									// ---------------------------------------------
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
														E = REST.Points[A][P].GET,
														err,itms,opts;
													// --------------------------------
													[err,itms,opts] = await E(R);
													itms = await doLinks(itms,opts);
													return FromJS(Assign({},itms));
												} catch (e) { return e; } };
											return Promise.all(links.toArray().map(prom));
										};
										// -----------------------------------------
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
										}	}; 	
										return 	items;
									};	itms = await doLinks(itms,opts);
									// --------------------------------------------
									LG.IF(itms)
									route.SN(res, err||itms, opts);
								} catch (rerr) {
									console.log('MAIN ERR:', rerr)
									route.ER(res, ...rerr); 
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
						res.status(200).sendFile(pth, {}, (e) => {
							if (!!e) { 
								LG.Error(sid, 'EXTERNAL', `${fle} – ${e}`); 
								res.status(e.status).end();
							} else {
								LG.Server(sid, 'EXTERNAL', fle, 'magenta'); 
							}
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
			let point, patterns = {}, ReqPtrn = ReqPatternFactory(patterns);

			// Instantiate Route
				REST[kind](name, route); 
				point = REST.Points[name];
			
			// Variables
				let root 	 = '/'+name.toLowerCase(),
					router 	 = Express.Router({ mergeParams: point.Merge }),
					hroute 	 = Express.Router({ mergeParams: true }),
					lstore   = Session.Stores.Limits,
					validr   = ReqHandle.Valid(true),
					limiters = { 
						root: Session.Limiter(router, lstore), 
						help: Session.Limiter(hroute, lstore)
					}, 	hlimit;

			// Handle Validation
				if ('Validate' in REST.Points[name]) Valid = REST.Points[name].MIDDLEWARE.Validate;	
				hlimit  = ReqHandle.Limit('help',limiters.help,point,'/',null,`${root}/`);

			// Handle Documentation (root); if applicable
				if (!Object.keys(route.Actions).has('/')) PushRoute(
					hroute, 'all', '/', ReqHandle.Errs(point, '/'), hlimit, validr
				);

			// Handle Errors
				Imm.Map(route.Errors).map((paths, which) => {
					paths.map((scheme, i) => { PushRoute(
						router, 'all', scheme, ReqHandle.Errs(point, MSG[which]), 
						ReqHandle.Limit('erro', limiters.root, point, '/', null, `${root}${scheme}/`.replace(/[/]+$/,'/'))
					);	});
				});

			// Handle Points
				Imm.OrderedMap(route.Actions).reverse().filter(act=>!!!act.isNamespace).map((act, pth) => { try {
					let allowd  = act.Methods,
						denied  = HTTPREQ.filter((v,i)=>allowd.indexOf(v)<0),
						onlyMD  = allowd.has('MIDDLEWARE') && allowd.length>1,
						key     = ReqPtrn(pth, act, null, true),
						dir     = `${root}${ReqPtrn(pth, act, null, true)}`,
						limitr 	= ReqHandle.Limit('endp',limiters.root, point, pth, null, dir);
					// Handle Good-Guy Requests
						allowd.filter(M=>!!act[M]).map(M=>{
							let mth 	= act[M],
								isMdle  = M==='MIDDLEWARE',
								func    = M.toLowerCase(),
								head 	= mth.Doc.Headers,
								vld 	= !isMdle ? ReqHandle.Valid(head) : null,
								lmt 	= ReqHandle.Limit('endp',limiters.root, point, pth, M, dir),
								main    = ReqHandle.Main(point, pth),
								upld    = ReqHandle.Upload(M,mth.Doc.Files),
								lname 	= name.toLowerCase(), 
								scheme, schm;
							// Handle Path
								scheme   = ReqPtrn(pth, act, M);
								mth.Base = name;
								mth.Path = scheme;
								schm     = {
									template: mth.PathTemplate,
									matcher:  mth.PathMatcher,
								};
							// ----
								SockRoute(name, key, pth, lmt, vld, upld, schm); // Socket
								if (!isMdle) PushRoute(router, func, scheme, main, lmt, vld, upld);
						});

					// Handle Douchebag Requests
						denied.map(M => {
							let func = M.toLowerCase(), err = MSG['NO_'+M];
							PushRoute(router, func, key, ReqHandle.Errs(point, err), limitr, null);
						});
					// Handle Documentation (sub)
						!onlyMD && PushRoute(
							hroute, 'all', key, ReqHandle.Errs(point, pth), hlimit, validr
						);
				} catch(e) { console.log(act); console.log(patterns); throw e; }; });

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
	async function AddSpaces (spaces) {
		let PUSH = null;

		async function MrkSpace(spaces) {
			try { 
				if (!!!spaces) throw new Error('No Spaces');
				if (!!!Publics.Folder) return;
				let fldr = Publics.Folder.index;
				return await RDFL(fldr, 'utf8'); 
			} catch (err) {
				LG.Error('Markup', 'EXTERNAL', err.message);
				return null;
			}
		}

		function LogSpace (nme, dsc = '', kind = 'normal') {
			let msf = 'An Application for %s', nmf = '%15-s',
				name = nmf.format(nme), opts = [];
			switch (kind) {
				case 'global': opts = ['^^^^^', 'blue']; break;;
				case 'render': opts = ['Rendered', 'magenta']; break;;
				case 'normal': opts = [msf.format(dsc), 'gray']; break;;
			};
			LG.Server(name, 'NameSpace', ...opts);
		};

		function AddSpace (name, kind, global = false) {
			/////////////////////////////////////////////////////////////////////////////
			let url   = `/${name}`,
				space = IO.of(url), 
				globl = global,
				auth  = kind=='auth',
				rest  = kind=='rest',
				page  = kind=='page',
				lstnr = [
					'Save','Renew','Reload','Regenerate','Destroy',
					'reconnect_attempt','error','disconnect'
				],
				epnts = [],
				hndls = Socks.filter(v => {
							let key = TLS.Path([v[0], v[1]]),
								mch = !!key.match(/^\/auth\//),
								res = (mch == auth);
							res && epnts.push(key); return res;
						})
						.map(v => { let a = v.slice();
							// Remove checks/limits for System API, if needed
							globl && (a[3] = [],a[4] = null);
							// Create Routers for Socket User
							return ReqSocket(...a);
						});

			/////////////////////////////////////////////////////////////////////////////
			space.on("connection", socket => {
				socket.use((packet, next) => {
					// console.log('HELLO!!!!')
					return next();
				})
				/////////////////////////////////////////////////////////////////////
				// VAR / FUNCTIONS //////////////////////////////////////////////////

					let Req, MID = '', SID = '', NID = '', RID, Checker = ReqHandle.Check(),
						LGMSG 	= 	(kind,err,msg)=>[kind,msg||(err||{}).message].filter(v=>!!v).join(' - '),
						LGERR	= 	(kind,err,clr='red')=>LG.Error(MID,'Session',LGMSG(kind,err),clr),
						LGSRV	= 	(kind,clr='yellow')=>LG.Server(MID,'Session',kind,clr),
						Init 	= 	() => {
							// Get Session Data
							Req = socket.request; 
							SID = Req.sessionID; RID = socket.id;
							MID = SID+RID; NID = url+'#'+SID;
							// For General Messages
							LG.Server(SID,'Session','Detaching', 'magenta');
							// Setup the Ednpoints
							hndls.map(v => v(socket));
							// For Auth Messages
							/* !globl &&  */auth && socket.join(SID);
						},
						Check 	= 	() => {
							if (!globl && auth) {
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
						lstnr.map(l => socket.removeAllListeners(l));

					// Determine Socket's Intention
						switch (true) {
							case globl:	// Broadcasts End-Points to Globals
								socket.emit('points', epnts);
								break;;
							case auth:	// Initializes Session Management for Authorizers
								Sessers( true, 'Save');             // For Session Renewing
								Sessers( true, 'Renew');            // For Session Renewing
								Sessers( true, 'Reload');           // For Session Reloading
								Sessers(false, 'Regenerate', Init); // For Session Regeneration
								Sessers( true, 'Destroy');          // For Session Destroying
								break;;
							// case rest:	// Constructs End-Points for Clients
								// //
								// console.log('RESTING!!!!');
								// break;;
							case page:	// Distibutes Markup for Pages
								let sobj = Pages[name], dobj = Pages['default'],
									head = socket.handshake.headers, 
									host = head.host, refr = head.referer,
									regx = `^https?:\/{2}${host}(\/.+)$`,
									path = refr.replace(new RegExp(regx),"$1"),
									LKID = ReqIOID(socket.request),
									LOKR = Session.Stores.Lockers,
									send = res => socket.compress(true).emit(
										'state', (JSON.parse(res)||[{}])[0]
									);
								// -------------------------------------------------------
									if (!!!sobj) sobj = dobj;
									sobj.Data  = (sobj.Data ||dobj.Data );
									sobj.Build = (sobj.Build||dobj.Build);
								// -------------------------------------------------------
									function Builder() {
										LOKR.get(LKID,(err,res)=>send(res||"[{}]"));
									}
								// -------------------------------------------------------
									socket.on('setup', Builder);
									break;;
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

		function AddSite  (space, markup) {
			let refl =  'route.js | AddSpaces.AddSites |',
				cnfg = 	Assign({}, space.config),
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
				mkup =  markup,
				head = 	{
					'Content-Type':  'text/html',
					'Cache-Control': 'no-cache', // `public, max-age=${Publics.Age}`
				},
				LOKR =  Session.Stores.Lockers,
				ICO  =  (head, url) => (
					head.referer == url && 
					!!head.accept.match(
						/image\/(?!webp|apng)/g
				)	),
				EIF  = (cnfg.errorIF||(()=>false)),
				RFG, RND;
			// -----------
			cnfg.errorIF = (...args) => {
				try { return EIF(...args); }
				catch (e) { return true; }
			};
			// -----------
			RFG = {
				name:	 cnfg.name,
				page:	 cnfg.page,
				errorIF: cnfg.errorIF,
			};
			RND = Renders(RFG, REST);
			// -----------
			return async function AddingSite(req, res) {
				let path  = req.originalUrl,
					host  = req.headers.host,
					ptcl  = req.protocol,
					hdrs  = req.headers,
					ssid  = req.sessionID,
					url   = `${ptcl}://${host}${path}`,
					RDR   = (rnd, res, lid) => (
								rnd.Clear(lid),
								res.redirect(307, '404')
							),
					HTM   = async (usr,cfg,lid,rnd,res,ret=null) => {
								let html, cont, stat, rep, htm, pay, eif = false,
									send = async (htm)=>res.status(200).send(htm),
									save = async (ctn)=>{
										stat = await LOKR.set(lid,ctn,'EX',300);
										LG.NOW(`${refl} CALL CACHED: <%s>`, stat);
										rnd.Clear(lid);
									};
								// -----------------------------------------------
									if (!!ret) pay = ret.payload.result;
								// -----------------------------------------------
									cfg.title = cfg.page.title(path,usr,pay);
									rnd.Auth(cfg.title,usr);
								// -----------------------------------------------
									eif  = cfg.errorIF(ret); 
									if (eif) RDR(rnd, res, lid);
								// -----------------------------------------------
									try { 
										({HTML:html,State:cont} = rnd.Render(pay, lid)); 
										rnd.HTML = html;
									// -------------------------------------------
										rep  = repl(rnd, lid, cfg);
										htm  = sani(mkup, rep);
									// -------------------------------------------
										await Promise.all([
											save(cont), send(htm),
										])
									// -------------------------------------------
								} catch (e) { 
									console.log('RNDR ERR:', e); 
									RDR(rnd, res, lid);
								};
							};
				// ------
				!!!RFG.host && (RFG.host = `//${host}`);
				// ------
				if (ICO(hdrs,url)) {
					res.end('');
				} else {
					// ------
					// try { PUSH(req, res); } 
					// catch (e) { throw e; }
					// ------
					LG.Timed(async () => {
						let rnd, call, ret,
							lid = ReqIOID(req),
							usr = req.profile, 
							cfg = Imm.fromJS(RFG).toJS();
						// ------
						rnd = new RND(lid, path);
						res.header(head);
						// ------
						try {
							if (!!rnd.Call) {
								let { params, query, body, files } = req;
								// ------
								call = rnd.Call(path,params,query,body,files,usr);
								// ------
									// var end, beg = new Date();
								ret  = await REST.Remote[call.method](
									call.path, 
									call.params,
									call.query||call.body, 
									call.files
								);
									// end = (new Date() - beg);
									// LG.Server(ssid, 'CALLER', `< ${end}ms > ${path}`, 'magenta');
							};

								// var end, beg = new Date();
							HTM(usr,cfg,lid,rnd,res,ret);
								// end = (new Date() - beg);
								// LG.Server(ssid, 'SEND', `< ${end}ms > ${path}`, 'magenta');

						} catch (err) { 
							let obj = { message: err.message, stack: err.stack },
								msg = JSON.stringify(obj, null, '    ');
							console.log(`${refl} CALL CACHE ERROR:`, msg, '\n');
							!!rnd.Redirect && res.redirect(301,rnd.Redirect);
						};
					},	ssid, 'EXTERNAL', path, 'magenta');
				};
			};
		}

		// HTTP/2 PUSH Essential Files
			const 	ISOP = new Isolate('../src/push.js', {
						FILES: 	 spaces.PUSH||[],
						Publics: Publics,
						mime: 	 mime,
						LG:		 LG,
					})
			PUSH = 	await ISOP.run();
			// console.log('ISOLATE:',PUSH)

		// Configure External/Socket Routes; Initialize the Custom Namespaces, if available
			await MrkSpace(spaces).then(mark => {
				let GBL = spaces.Global, 
					EXP = GBL.expose,
					HND = [
						({ k, typ, gbl, nme }) => { if (gbl) {
							// console.log('%s: Global', k)
							let gme = `gbl-${nme}`; 
							Spaces[k] = AddSpace(gme, typ, true);
							LogSpace(gme, '', 'global');
						}	},
						({ k, typ }) => { if (typ=='auth') {
							// console.log('%s: Accessor', k)
							Session.Accessor = Spaces[k]; 
						}	},
						({ k, v, typ, nme, stc, sch, url }) => {
							if (typ=='page') {
								// console.log('%s: Site', k)
								let rou = Express.Router(), ste, 
									chk = ReqHandle.Check(stc);
								Sites[k] = ste = AddSite(v, mark);
								rou .get('/', chk, ste); 
								rou.post('/', chk, ste);
								API.use(!!sch?sch:url, rou); 
								LogSpace(nme, '', 'render');
							}
						}
					];
				// ----------------------------------------------------------------
				Imm	.OrderedMap(spaces)
					.filter((v,k)=>!['Global','PUSH'].has(k)&&v.config.name!='global')
					.map((v,k) => {
						let typ = v.type,
							c   = v.config,
							nme = c.name,
							dsc = c.description,
							gbl = EXP.has(nme),
							acc = c.accessor,
							stc = c.restrict,
							sch = c.scheme,
							url = `/${nme}`;
						// Create Socket Space
						Spaces[k] = AddSpace(nme, typ); LogSpace(nme, dsc);
						// Handle Globals, Accessors, Sites
						try { HND.map(H => H({ 
							k, v, typ, gbl, acc, nme, stc, sch, url 
						})); } catch (err) {
							console.log(err)
						}
				});
				// Connect to Globals ---------------------------------------------
				REST.Start();
			}).catch(err => {
				// Otherwise, add placeholder NameSpace
				Spaces.Index = AddSpace('/');
			});
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
							console.log('PATH ERROR')
							res.status(404).json({ status: 1, request: req.originalUrl, error: err });
						})
						.all("/favicon.ico", (req, res) => {
							var PUB = Publics, name = PUB.Folder,
								fle = '/images/icons/favicon.ico',
								pth = name.path(fle), sid = req.sessionID;
							res.header({ 'Cache-Control': `public, max-age=${PUB.Age}` });
							res.status(200).sendFile(pth, {}, (e) => {
								if (!!e) { 
									LG.Error(sid, 'EXTERNAL', `${fle} – ${e}`); 
									res.status(e.status).end();
								} else {
									LG.Server(sid, 'EXTERNAL', fle, 'magenta'); 
								}
							});
						})
						.all("/", GetHelp);
					// Chain It
					let MK=MAKER.FileRoutes(Setting.Folders)
								.AuthRoutes(REST.Config.AuthP)
								.DataRoutes(REST.Config. EndP)
								.HelpRoutes()
								.SiteRoutes();
					// ------
					return MK;
				},
				FileRoutes(P) { AddFolder(P); return MAKER; },
				AuthRoutes(P) { AddRoutes(P, 'AURequest'); return MAKER; },
				DataRoutes(P) { AddRoutes(P, 'DBRequest'); return MAKER; },
				HelpRoutes( ) { AddDocuments( ); return MAKER; },
				async SiteRoutes( ) { await AddSpaces(NMSP); return MAKER; },
			};

	module.exports = MAKER;

/////////////////////////////////////////////////////////////////////////////////////
