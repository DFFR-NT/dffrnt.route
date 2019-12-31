/// <reference types="dffrnt.confs" />
/// <reference types="express" />
/// <reference types="express-serve-static-core" />
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// DEFINITIONS

	/**
	 * ...
	 * @callback AddingSite
	 * @param {ExRequest} req 
	 * @param {ExResponse} res
	 * @returns {Promise<void>}
	 */

	/**
	 * ...
	 * @callback ReqHandler
	 * @param {ExRequest} req 
	 * @param {ExResponse} res 
	 * @param {ExNext} [nxt] 
	 */

	/**
	 * @inheritdoc
	 * @typedef {import('dffrnt.confs').RouteAU} RouteAU
	 */
	/**
	 * @inheritdoc
	 * @typedef {import('dffrnt.confs').RouteDB} RouteDB
	 */

	/**
	 * @inheritdoc
	 * @typedef {import('dffrnt.route').REST.AURequest} AURequest
	 */
	/**
	 * @inheritdoc
	 * @typedef {import('dffrnt.route').REST.DBRequest} DBRequest
	 */
	/**
	 * The argument-object for the handlers withing `AddSpace()`.
	 * @typedef {Object} AddSPCArgs The argument object.
	 * @prop {string} k The key-name of the space.
	 * @prop {CFG.SPCE.Space} v The config properties of the space.
	 * @prop {boolean} gbl A flag denoting global status.
	 * @prop {CFG.SPCE.Type} typ The type of space this is.
	 * @prop {string} nme The name of the space.
	 * @prop {{true:string,false:string}} stc A restriction object for the space.
	 * @prop {(string|RegExp)} sch The path-scheme of the space.
	 * @prop {string} url The main url of the space.
	 */

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const  assert 	= require('assert');
	const  {
		colors, Assign, Imm, StrTime, ROOTD, path, os, fs,
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
	/** @type {import('dffrnt.route').REST */
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
			RDFL 	= UTL.promisify(fs.readFile);
	/** 
	 * @type {CFG.STTG.Folder} 
	 */
	const	Folder  = {
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
			};
	const 	storer  = multer.diskStorage,
			GetHelp = (req, res) => {
				let msg = MSG.HELP // Configure Main Route
				res.status(msg.status).send(
					JSN.Valid(REST.Help.Document, {}, {}, 1, msg.temp)
				);
			};

	let 	API 	= {};
	let		HLP 	= null;
	/** 
	 * @type {SESS.App}
	 */
	let		Session = null;
	/** 
	 * @type {import('express')}
	 */
	let		Express = null;
	/** 
	 * @type {SocketIO.Server}
	 */
	let		IO 		= null;
	/** 
	 * @type {CFG.Settings}
	 */
	let		Setting = {};
	/**
	 * @type {CFG.STTG.Folder}
	 */
	let		Publics = {};
	/**
	 * @type {CFG.STTG.Folder}
	 */
	let		Uploads = {};

	let     Schemes = {}

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
				send  	(result) { try {
					var THS = this, all = result.all, opt = result.options, 
						bdy = opt.body||{}, qry = opt.query||{}, 
						pth = (bdy.path||qry.path), drc = 'receive',
						ret = { status: THS.statNum, payload: result },
						rec = ((bdy.reqid||qry.reqid)||drc); 
						delete ret.payload.all;
					if (!!!all) { THS.Socket.compress(true).emit(rec, ret); }
					else { THS.Spaces.compress(true).to(THS.SID).emit(rec, ret); }
					LG.Server(THS.MID, 'Session', pth, 'green');
				} catch (e) { 
					console.log('ERROR [SocketRes.send]:', e, result); 
				}; 	}
		}

/////////////////////////////////////////////////////////////////////////////////////
// ROUTE HANDLERS

	/**
	 * Registers an `HTTP` route to the `REST-API`.
	 * @param {ExRouter} router The `Router` object.
	 * @param {ExMethod} method The **method(s)** this `Route` will respond to.
	 * @param {string} scheme The **path-scheme** of this `Route`.
	 * @param {CBExHandler} handler The **request-handler** that facilitates the purpose of this `Route`.
	 * @param {CBExHandler[]} [limits=[]] An optional `Array` of **request-limits** this `Route` will adhere to.
	 * @param {CBExHandler} [validate] An optional **request-authenicator** this `Route` will adhere to.
	 * @param {CBExHandler} [upload] An optional **request-uploader**; if this `Route` accepts `files`.
	 */
	function PushRoute(router, method, scheme, handler, limits = [], validate, upload) {
		return router[method](...([
			scheme, limits,
			...([validate]||[]),
			...([upload]||[]),
			...[handler],
		].filter(v=>!!v)));
	}
	/**
	 * Registers n `Socket` route to the `REST-API`.
	 * @param {string} action The `name` of the `BaseEndpoint` this `Socket` belongs to.
	 * @param {string} key The `name` that will trigger the `handler` for this `Socket`.
	 * @param {string} path The **name** of the `Endpoint` this `Socket` represents.
	 * @param {CBExHandler[]} [limits=[]] An optional `Array` of **request-limits** this `Socket` will adhere to.
	 * @param {CBExHandler} [validate] An optional **request-authenicator** this `Socket` will adhere to.
	 * @param {CBExHandler} [upload] An optional **request-uploader**; if this `Socket` accepts `files`.
	 * @param {TPSchemeChk} scheme An object consisting of a `template` and `matcher` for validating requests for this `Socket`.
	 */
	function SockRoute(action, key, path, limits = [], validate, upload, scheme) { 
		Socks.push([action, key, path, limits, validate, upload, scheme]); 
	}

	/**
	 * Retrieves the `cookieID` of the client's `SocketIO` session.
	 * @param {ExRequest} req The client `request` object.
	 */
	function ReqIOID(req) {
		// console.log('ReqIOID:', JSON.stringify(req.headers,null,'  '), '\n')
		let cookie = ((req||{}).headers||{}).cookie||'';
		return (cookie.match(/io=(\S+)(?=;|$)/)||[])[1];
	}
	/**
	 * Logs the `path-stack` within a `Router`.
	 * @param {string} name The `name` of the `route`.
	 * @param {ExRouter} router The actual `Router` object.
	 */
	function ReqLog (name, router) {
		LG.IF(`\n\n\n\n${name} |`, router.stack.map((v,i) => {
			let r = v.route, m = Object.keys(r.methods)[0];
			return { [m]: r.path };
		}));
	}
	/**
	 * Clones the `request` made in the current `Socket`.
	 * @param {SocketIO.Socket} socket A `socket` handling the `request`.
	 * @returns {any} The cloned `request`.
	 */
	function ReqClone(socket) {
		let orq = socket.request, srq = {};
		Object.keys(orq).map(k=>(srq[k]=orq[k]));
		return srq;
	}
	/**
	 * Hydrates a `socket-session` with the current `request` of a client.
	 * @param {ExRequest} request The `socket-session` object.
	 * @param {TPRequest} def A `request` object of default parameters.
	 * @param {TPRequest} req The current `request` object.
	 * @param {string} pscheme The `path-scheme` of this `request`.
	 * @returns {ExRequest} The hydrated `socket-session`.
	 */
	function ReqMerge (request, def, req, pscheme) {
		let srq  = 	request, 
			mrq  = 	Assign({},def,req),
			raw  = 	srq.rawHeaders,
			prm  = 	Imm.Map(req.params||{}),
			orl  = 	pscheme,
			rgx  =  [
						'(?:\\/[{][^{}]*(\\b',
						'\\b)[^{}]*[}][?]?)(?=\\/|$)'
					],
			url  = 	prm.reduce((a,v,p)=>(a.replace(
						new RegExp(`${rgx[0]}${p}${rgx[1]}`,'g'), `\/${v}`
					)),	orl)
					.replace(/\/\{\b[\w_-]+\b\}\?/g,'');
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
	/**
	 * ...
	 * @param {*} loader 
	 * @param {multer.DiskStorage} store 
	 */
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
	/**
	 * Builds a `function` for a `Route` that will construct the _full-path_ & `scheme` of each of it's `methods`.
	 * @param {CLReqPatterns} patterns A plain-object representing the `schemes` of a `Route`, it's `subRoutes`, and it's `methods'` paths.
	 * @returns {CBReqPattern} The path constructor `function`.
	 */
	function ReqPatternFactory (patterns) {
		/**
		 * ...
		 * @param {string} path ...
		 * @param {string[]} [params=[]] ...
		 */
		function Sanitize(path, params = []) {
			path = (path||''); params = (params||[]);
			let rgx = /[/|]+:(\w+)[(].+?[)](?:(?=[)\/|])|$)/g,
				rep = ($0,$1)=>(params.has($1) ? $0 : '');
			return path .replace(/^\/+((?!=\/).*[^\/])\/+$/,'$1')
						.replace(/^\\+$/,'')
						.replace(rgx,rep);
		}

		return function ReqPattern (name, act, method, noScheme = false) {
			let mth, pth, sch, sub, mmd, prm;
			name = name.toLowerCase(); noScheme = !!noScheme; 
			/** @type {QueryGN} */ 
			mth = (act[method]);
			// Merge Patterns; if needed
			if (!!method && !!patterns && !!mth.Merge) {
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
	/**
	 * Constructs a `function` that configures a `socket-session` with it's appropriate `handlers` and a `response` object.
	 * @param {string} action The `name` of the `BaseEndpoint` this `Socket` belongs to.
	 * @param {string} key The `name` that will trigger the `handler` for this `Socket`.
	 * @param {string} path The **name** of the `Endpoint` this `Socket` represents.
	 * @param {CBExHandler[]} [limits=[]] An optional `Array` of **request-limits** this `Socket` will adhere to.
	 * @param {CBExHandler} [validation] An optional **request-authenicator** this `Socket` will adhere to.
	 * @param {CBExHandler} [upload] An optional **request-uploader**; if this `Socket` accepts `files`.
	 * @returns {CBReqRocket} The `socket-session` configurator `function`.
	 */
	function ReqSocket (action, key, path, limits = [], validation, upload) {
		var key = TLS.Path([action, key]),
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
							let sch = Schemes[key][req.method];
							// console.log(`oURL: ${req.actualUrl} :: ${req.method} :: (${key}) :: [${sch.matcher}]`)
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
			socket.on(key, req => {
				let sch = Schemes[key][req.method];
				nxt(ReqMerge(
					ReqClone(socket), 
					def, req, sch.template
				), res)
			});
			return key;
		}
	}

	const LIMIT_RGX = new RegExp(`^(\\d*)(${[
		['Years',  'y'], ['Months',       'M'],
		['Weeks',  'w'], ['Days',         'd'],
		['Hours',  'h'], ['Minutes',      'm'],
		['Seconds','s'], ['Milliseconds','ms'],
	].map(d => `(?:${d[0]}?|${d[1]})`).join('|')}|)$`);
	/**
	 * Determines the interval of a `request-limit` given it's `key`.
	 * @param {string} key The identifier of this `limit`.
	 */
	function ReqLimitDur(key) { try {
			let dur = ((key||'').split('/')[1]||'1Day')
						.match(LIMIT_RGX),
				len = dur[1]||1, 
				uni = dur[2];
			return moment.duration(Number(len),uni)
						.asMilliseconds();
		} catch (e) { 
			return moment.duration(1,'day')
						 .asMilliseconds();
	}; }

	/**
	 * ...
	 * @param {ExRequest} req 
	 */
	function ReqDataPath(req) {
		req[METHOD_MAP[req.method]].path = req.originalUrl;
	}

	/**
	 * Painstakingly parses a `User-Agent` string. Why? I dunno...
	 * @param {ExRequest} req The request object.
	 * @returns {ROUT.Client}
	 */
	function ReqUserAgent(req) {
		let headers = req.headers,
			uagent  = headers['user-agent'],
			O = {}, T = [];
		// ----------------------------------------- //
			T=uagent
				.replace(/ \w+\/\b[\d.]+\b +\(([^()]+like Gecko)\)/,'')
				.replace(/^\w+\/\b[\d.]+\b +\(([^()]+)\)(?:.*( \b\w+\/\b[\d.]+(?:\.[A-z]+|)\b[+]?)(?: [^\/]+)?|)$/,'$1 >>$2')
				.replace(/(; +(U|\b[A-z]{2}-[A-z]{2}\b)|CPU +| +like \b[^;>\/)]+\b|\S*https?:\S+)/gi,'')
				.replace(/^compatible(?=;)/,'BOT')
				.replace(/iPhone OS/,'iOS')
				.replace(/Intel Mac OS X/,'macOS')
				.replace(/;( +;)+/,';')
				.replace(/;\s+>>/g,' >>')
				.replace(/^([^;>]+)(?:; +(\b[^;>]+\b)(?:; +(\b[^;>]+\b)(?:; +(\b[^;>]+\b)|)|)|)(?: >>(.*)|)$/, '$1; $2; $3; $4 >>$5')
				.replace(/\bBuild\/([^\s;]+)/,'($1)')
				.replace(/[\d,]+(?=\/)/,'')
				.replace(/_(\d+)/g,'.$1')
				.split(/; | (?=>>)/)
				.map(v=>v.length<3?'':v);
		// ----------------------------------------- //
			O.platform=T[0]; O.os=T[1];
			O.device=[(T[2].length>3?T[2]:T[0]),T[3]].join(' ').trim();
			O.browser=T[4].replace(/^>> ([^\/\b]+)\/([^\/\b]+)$/,'$1 ($2)');
		// ----------------------------------------- //
			return O;
	}

	/**
	 * A collection of `session-handlers` that perform basic task needed to maintain a `session`.
	 */
	const 	ReqSession	= {
				/**
				 * An `error` logger for other `ReqSession` methods.
				 * @param {string} name An `identifier` use to specifiy where the `error` came from.
				 * @param {Error} err The `error` object that was `thrown`.
				 */
				LogErr		(name, err) {
					LG.IF(`ERROR | ${name} |`, err);
				},
				/**
				 * Saves a _new_ client `session`.
				 * @param {ExRequest} req The client `request` object.
				 * @param {CLSessData} data A plain-object of `meta-data` to **save** with the `session`.
				 */
				Save 		(req, data = {}) { 
					let THS = this; try {
						data = data||{};
						let sess = req.session, 
							conn = req.connection,
							user = sess.user||{}, 
							cags = Session.Cookie.Age, 
							age  = cags.In, 
							rem  = !!data.__rem;
						rem && (age = cags.Rem);
						delete data.__rem;
						sess.cookie.maxAge = age;
						sess.user = Assign(user, data, {
							client: Assign({ 
								since: Date.now(),
								ip: conn.remoteAddress.replace(/[^\d.]/g,'') 
							},	ReqUserAgent(req)
						)	});
						sess.touch(); sess.save();
						Session.Group.Set(
							user.id, req.sessionID
						);
					} catch(e) { console.log(e); THS.LogErr('Save',e); } 
				},
				/**
				 * Renews a client's _near-expired_ `session`.
				 * @param {ExRequest} req The client `request` object.
				 * @param {CLSessData} data A plain-object of `meta-data` to **save** with the `session`.
				 */
				async Renew (req, data = {}) {
					let THS = this; try { 
						let SESS = Session, SS = req.session, EX = SS.cookie.maxAge;
						if ( EX / SESS.Cookie.Age.In <= 0.20 ) this.Save(req, data);
					} catch (e) { console.log(e); THS.LogErr('Renew',e); }	
				},
				/**
				 * Reloads a client's _dormant_ `session`.
				 * @param {ExRequest} req The client `request` object.
				 */
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
				/**
				 * Regenerates a client's _current_ `session`.
				 * @param {ExRequest} req The client `request` object.
				 */
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
				/**
				 * Destroys a client's `session`.
				 * @param {ExRequest} req The client `request` object.
				 */
				Destroy 	(req) {
					let THS = this; try {
						let sid  = req.sessionID,
							sess = req.session||{},
							user = sess.user||{acct:'none'},
							acct = user.acct,
							cags = Session.Cookie.Age,
							cook = sess.cookie;
						delete sess.user; cook.maxAge = cags.Out; sess.save();
						Session.Group.Rem(user.id, req.sessionID);
						LG.Server(sid, 'SESSION', `Destroyed < ${acct} >`, 'red');
					} catch (e) { THS.LogErr('Destroy',e); }
				},
				/**
				 * Removes _senstive-data_ from a client's `session`/`payload`.
				 * @param {ExRequest} req A client `request` object to sanitize.
				 * @param {ROUT.JSN.Response} ret A client `request` object to sanitize.
				 * @param {ROUT.User} usr A client `user` object to sanitize.
				 * @param {ROUT.JSN.Query} bdy A client `body` object to sanitize.
				 */
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
	/**
	 * A collection of `handler` factories pertaining to specific purposes within a `request`.
	 */
	const 	ReqHandle 	= {
				/**
				 * Builds a **validation** `handler` to be used within a `Page` request.
				 * @param {{true?:string,false?:string}} [redirect={}] An object whose properties, `true` or `false`, retrieve a redirection path given whether the request succeeded or not. 
				 * @returns {CBExHandler} The handler `function`.
				 */
				Check (redirect = {}) {
					let NEXT = (res, stat, err, ret, next) => {
						let action = redirect[!!stat];
						if (!!!action) next(null,err||ret);
						else res.redirect(301,action);
					};
					return function Check(req, res, next) {
						Promise.resolve((async (req, res, next) => {
							let ret = await REST.Remote.MID(
										'/auth/check', {}, {
											_for: req.originalUrl
										}, {
											unlocked:   req.unlocked,
											headers: 	req.headers,
											session: 	req.session,
											sessionID: 	req.sessionID,
											cookies: 	req.cookies,
										}),	
								pay = ret.payload,
								opt = pay.options,
								bdy = opt.body||opt.query,
								usr = pay.result.user;
							// Renew Session
							ReqSession.Renew(req);
							// Sanitize Request
							ReqSession.Sanitize(req, ret);
							// Hydrate Request
							delete bdy._for;
							req.headers.token = usr.Token;
							req.profile = usr;
							// Continue
							NEXT(res, 1, null, ret, next);
						})(req, res, next)).catch(err=>{
							// console.log('CHKERR :', JSN.Pretty(err), req.sessionID)
							NEXT(res, 0, err, null, next);
						});
					};
				},
				/** 
				 * Builds a **validation** `handler` to be used within a `Route`.
				 * @param {ROUT.Headers} headers Validation relies on `headers`, so if this is not set - _or it is set to `false`_ - then the `Route` will **not** be validated.
				 * @returns {CBExHandler} The handler `function`.
				 */
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
											// unlocked:   req.unlocked,
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
							// console.log('VLDERR:', JSN.Pretty(e)),
							// next(e)
							res.status(e.status).send(e.payload)
						));
					} : DFLVLD);
				},
				/**
				 * Builds a series of **limiter** `handlers` to restrict a `Route`.
				 * @param {CBExHandler} limiter The limit `handler` that will form the basis of each limit within the series.
				 * @param {(AURequest|DBRequest)} point The request-engine.
				 * @param {string} key The last path of the `EndPoint`.
				 * @param {HMETHOD} method The method this `handler` will repsond to.
				 * @param {string} path The _full-path_ of the `EndPoint`.
				 * @returns {CBExHandler[]} The handler `functions`.
				 */
				Limit (limiter,point,key,method,path) {
					let HND = point.Limit.bind(point),
						PTH = path.replace(/[/]+$/,''),
						RQL = (!!key&&((point.Requests.get(key)||{})[method]||{}).Limits||[]),
						AFL = (l=>!!!(ALL[l].omit||[]).has(path)),
						OFL = (l=>RQL.has(l)),
						LMT = Setting.Session.Limits, 
						ALL = LMT.All,		ALK = Object.keys(ALL), A,
						OPT = LMT.Optional, OPK = Object.keys(OPT), O;
					/** @type {CBExHandler[]} */
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
				/**
				 * Builds an **upload** `handler` to be used within a `Route`.
				 * @param {('POST'|'PUT'|'DELETE')} method The method this `handler` will repsond to.
				 * @param {string[]} files A list of filenames.
				 * @returns {CBExHandler} The handler `function`.
				 */
				Upload(method, files) {
					if (!['PUT','POST'].has(method)||!!!files||!!!Uploads) return null;
					// ---------------------------------------------------------
					let fold = 	Uploads.Folder,
						root =  fold.root.replace(/^\//,''),
						kind =  (files.max>1?'array':'single'),
						fdst =  (files.dest||(() => '')),
						fnme =  (files.name||((_p,_b,file) => file.originalname)),
						stre = 	storer({
									destination: function (req, file, cb) {
										let prm = req.params, bdy = req.body,
											dst = fdst(prm, bdy, file),
											dir = fold.path(dst);
										fs.mkdir(dir, 755, _err => cb(null, dir));
										req.body.location = fold.join(root,dst);
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
				/**
				 * Builds an **error** `handler` to be used within a `Route`.
				 * @param {(AURequest|DBRequest)} point The request-engine.
				 * @param {import('dffrnt.route').Errors.HTTP_MSG} err An error-message object.
				 * @returns {CBExHandler} The handler `function`.
				 */
				Errs  (point, err) {
					return (req, res) => {
						point.Error(req, res, err);
					};
				},
				/**
				 * Builds the **main** `handler` to be used within a `Route`. This handles the 
				 * "purpose" of a client's request.
				 * @param {(AURequest|DBRequest)} point The request-engine.
				 * @param {string} path The name of the `EndPoint`.
				 * @returns {CBExHandler} The handler `function`.
				 */
				Main  (point, path) {
					let SR = 'ServerResponse';
					switch (point.constructor.name) {
						case 'AURequest': 
							return async (req, res, nxt) => {
								/** 
								 * @type {AURequest}
								 */
								let route = point;
								let meth  = req.method,
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
									// console.log('MAIN AUTH ERR:', { 
									// 	url, path, meth, rerr
									// });
									// throw rerr
									route.ER(res, ...rerr); 
								};
							};
						case 'DBRequest':
							return async (req, res) => { 
								/** 
								 * @type {DBRequest}
								 */
								let route = point;
								let meth  = req.method,
									exc   = route[path][meth];
								ReqDataPath(req);
								try {
									// ---------------------------------------------
									let [err,itms,opts] = await exc(req);
									/**
									 * Retrieves the results from all of the links within a result.
									 * @param {TPQryObject|TPQryObject[]} items The results.
									 * @param {ROUT.JSN.Options} meta The result options.
									 * @returns {Promise<(TPQryObject|TPQryObject[])>}
									 */
									async function doLinks(items,meta) {
										/**
										 * Retrieves the results of a collection of links.
										 * @param {import('immutable').OrderedMap<string,string>} links A collection of links.
										 * @returns {Promise<(TPQryObject|TPQryObject[])>}
										 */
										function runLinks(links) {
											let prom = async v => { try {
													let S = v.replace(/SocketLink/,''),
														O = JSON.parse(S), 
														Q = O.point,
														R = {
															originalUrl: `/${Q.join('/')}`,
															params: O.params||{},
															query: 	O.query	||{},
															body: 	O.body	||{},
															files: 	O.files	||[] },
														P = {
															true:  ()=>Q.slice(-1)[0].toTitleCase(),
															false: ()=>'/' 
														}[Q.length>1]();
													let A = Q[0].toTitleCase();
													let E = REST.Points[A][P].GET;
													// --------------------------------
													let [err,itms,opts] = await E(R);
													// --------------------------------
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

	/** 
	 * Endpoints for when the browser is requesting `/folder/*.*`
	 * @param {CFG.STTG.Folders} folders
	 */
	function AddFolder (folders) {
		if (!!!folders) return false; // Abort, if needed.
		let FKEYS = Object.keys(Folder),
			IFOLD = Imm.fromJS(Folder),
			FMRGE = (o,n) => n||o,
			FPROP = (v,k) => FKEYS.has(k),
			FLDRS = Imm.Map(folders).map(
				/** 
				 * @param {CFG.STTG.Folder} v
				 * @param {string} _k
				 */
				(v,_k) => {
					/** @type {CFG.STTG.Folder} */
					let FLD = 	IFOLD.mergeDeepWith(FMRGE,Imm.Map(v).filter(FPROP)).toJS();
					let FHD = { 'Cache-Control': `public, max-age=${FLD.Age}` };
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
					pub.get('/', (_req, res) => { res.status(403).send('Nope...'); });
					/////////////////////////////////////////////////////////////////////////////
					pub.get('/*', hnd); pub.post('/*', hnd);
					API.use(name.root, pub); return FLD;
			}).toObject();

		Publics = FLDRS.Publics||{};
		Uploads = FLDRS.Uploads||{};
	}
	/**
	 * Endpoints for when an API is accessed 
	 * @param {CFG.PNTS.Routes<TPBasePoints>} routes A collection of `BaseEndpoints` to add.
	 * @param {TPReqKind} kind The `request-type` these `BaseEndpoints` will be configured as.
	 */
	function AddRoutes (routes, kind) {

		/**
		 * Builds a `Route` for `ExpressJS` & `Socket.IO`, based on the configurations given.
		 * @param {CFG.PNTS.Base<(RouteAU|RouteDB)>} route A `BaseEndpoint`.
		 * @param {string} name The name of the `BaseEndpoint`.
		 * @param {TPReqKind} kind The `request-type` this `BaseEndpoint` will be configured as.
		 */
		function AddRoute (route, name, kind) {
			let point, patterns = {}, ReqPtrn = ReqPatternFactory(patterns);
			let actions = route.Actions;

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
				hlimit  = ReqHandle.Limit(limiters.help,point,'/',null,`${root}/`);

			// Handle Documentation (root); if applicable
				if (!Object.keys(actions).has('/')) PushRoute(
					hroute, 'all', '/', ReqHandle.Errs(point, '/'), hlimit, validr
				);

			// Handle Errors
				/**
				 * A factory that creates a Route Register for invalid paths.
				 * @param {HTTP_ERRORS} which The type of HTTP Error a path will yield.
				 * @returns {(scheme:string,_i:number)=>void}
				 */
				let ErrPusher = (which) => (scheme, _i) => { PushRoute(
									router, 'all', scheme, 
									ReqHandle.Errs(point, MSG[which]), 
									ReqHandle.Limit( ...ErrLimit, 
										`${root}${scheme}/`.replace(/[/]+$/,'/')
								)	);	};
				let ErrLimit  = [limiters.root, point, '/', null],
					ErrDiscov = FromJS({ 
									BAD_REQ: Imm.Map(actions)
												.filter(act=>!!act.isNamespace)
												.map((_a,p)=>`/${p.toLowerCase()}/`)
												.toArray()
								})
								.mergeDeep(FromJS(route.Errors));
				// Register Invalid Paths
				ErrDiscov.map((paths, which)=>paths.map(ErrPusher(which)));

			// Handle Points
				Imm.OrderedMap(actions).reverse().filter(act=>!!!act.isNamespace).map((act, pth) => { try {
					let allowd  = act.Methods,
						denied  = HTTPREQ.filter((v,i)=>allowd.indexOf(v)<0),
						onlyMD  = allowd.has('MIDDLEWARE') && allowd.length>1,
						key     = ReqPtrn(pth, act, null, true),
						onKey   = TLS.Path([name, key]),
						dir     = `${root}${ReqPtrn(pth, act, null, true)}`,
						limitr 	= ReqHandle.Limit(limiters.root, point, pth, null, dir);
					// Handle Good-Guy Requests
						Schemes[onKey] = {};
						allowd.filter(M=>!!act[M]).map(M=>{
							let mth 	= act[M],
								isMdle  = M==='MIDDLEWARE',
								func    = M.toLowerCase(),
								head 	= mth.Doc.Headers,
								vld 	= !isMdle ? ReqHandle.Valid(head) : null,
								lmt 	= ReqHandle.Limit(limiters.root, point, pth, M, dir),
								main    = ReqHandle.Main(point, pth),
								upld    = ReqHandle.Upload(M,mth.Doc.Files),
								scheme;
							// Handle Path
								scheme   = ReqPtrn(pth, act, M);
								mth.Base = name;
								mth.Path = scheme;
								Schemes[onKey][M] = {
									template: mth.PathTemplate,
									matcher:  mth.PathMatcher,
								};
							// ----
								SockRoute(name, key, pth, lmt, vld, upld); // Socket
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
				.filter((_v,k)=>k!="__DEFAULTS")
				.map((route, name)=>AddRoute(route, name, kind))
				.map(route=>route.Init());
	}
	/**
	 * Endpoints for when API documentation is requested or during API errors
	 */
	function AddDocuments () {
		// Create Helpdoc Route
		let name = '/apidoc';
		HLP .all("/", ReqHandle.Valid(true), GetHelp);
		API .use(name, HLP);
		REST.HPRequest(name);
	}
	/**
	 * Endpoints for when the API is accessed via Sockets
	 * @param {CFG.Spaces} spaces
	 */
	async function AddSpaces (spaces) {
		let PUSH = null, UNLOCKED = [];

		/**
		 * Determines whether an endpoint path should be unlocked or not.
		 * @param {string} [path=''] The endpoint path.
		 * @returns {boolean}
		 */
		function UnlockSpace(path = '') {
			return !!UNLOCKED.filter(u=>!!path.match(u)).length;
		}

		/**
		 * ...
		 * @param {CFG.Spaces} spaces 
		 */
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

		/**
		 * ...
		 * @param {*} nme 
		 * @param {*} dsc 
		 * @param {*} kind 
		 */
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

		/**
		 * Registers a Space into the backend.
		 * @param {Object} args The argument object.
		 * @param {string} args.name The name of the Space.
		 * @param {CFG.SPCE.Type} args.kind The type of Space.
		 * @param {boolean} [args.global] A flag denoting global status.
		 * @returns {SocketIO.Namespace} The `Socket.IO` `Namespace` handling this Space.
		 */
		function AddSpace ({ name, kind, global = false } = args) {
			/////////////////////////////////////////////////////////////////////////////
				let url   = `/${name}`;
				let space = IO.of(url);
				let globl = global;
				let auth  = kind=='auth';
				let rest  = kind=='rest';
				let page  = kind=='page';
				let lstnr = [
						'Save','Renew','Reload','Regenerate','Destroy',
						'reconnect_attempt','error','disconnect'
					];
				let epnts = [];
				let hndls = Socks.filter(v => {
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
				socket.use((_packet, next) => next())
				/////////////////////////////////////////////////////////////////////
				// VAR / FUNCTIONS //////////////////////////////////////////////////

					let Req, MID = '', SID = '', NID = '', RID, REF = '', Checker = ReqHandle.Check(),
						LGMSG 	= 	(kind,err,msg)=>[kind,msg||(err||{}).message].filter(v=>!!v).join(' - '),
						LGERR	= 	(kind,err,clr='red')=>LG.Error(MID,'Session',LGMSG(kind,err),clr),
						LGSRV	= 	(kind,clr='yellow')=>LG.Server(MID,'Session',kind,clr),
						Init 	= 	() => {
							// Get Session Data
							Req = socket.request; 
							Req.originalUrl = Req.url;
							SID = Req.sessionID; RID = socket.id;
							MID = SID+RID; NID = url+'#'+SID;
							// Determine the Page initiating the Session
							if (!globl) {
								let Hdr = Req.headers, 
									Rgx = new RegExp(`^https?://${Hdr.host}`),
									Ref = Hdr.referer||'';
								REF = Ref.replace(Rgx,'');
								Req.unlocked = UnlockSpace(REF)
							} else {
								Req.unlocked = true;
							}
							// For General Messages
							LG.Server(SID,'Session','Detaching', 'magenta');
							// Setup the Ednpoints
							hndls.map(v => v(socket));
							// For Auth Messages
							auth && socket.join(SID);
						},
						Check 	= 	() => {
							if (!globl && auth) {
								LGSRV('Checking', 'blue');
								let Res = new SocketRes(socket), HBD = !!Req.body;
										// ...
											// console.log(`\n\n\n\n`)
											// console.log(`*** REF: [${REF}] ***\n`)
											// console.log(`*** MTH: [${JSON.stringify(Req.method, null,'  ')}] ***\n`)
											// console.log(`*** QRY: [${JSON.stringify(Req.headers,null,'  ')}] ***\n`)
											// console.log(`*** QRY: [${JSON.stringify(Req.query,  null,'  ')}] ***\n`)
											// console.log(`*** BDY: [${JSON.stringify(Req.body,   null,'  ')}] ***\n`)
											// console.log(`${JSON.stringify(Object.keys(Req),null,'  ')}`)
											// console.log(`\n\n\n\n`)

								!HBD && (Req.body = {});
								Checker(Req,Res,(err,ret)=>{
									HBD && (delete Req.body);
									let obj = (err||ret);
									if (!!!obj) return;
									let { status, payload } = obj;
									try{delete payload.options.body.reqid;}catch(e){}
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
							case  auth:	// Initializes Session Management for Authorizers
								Sessers( true, 'Save');             // For Session Renewing
								Sessers(false, 'Renew');            // For Session Renewing
								Sessers( true, 'Reload');           // For Session Reloading
								Sessers(false, 'Regenerate', Init); // For Session Regeneration
								Sessers( true, 'Destroy');          // For Session Destroying
								break;;
							case  rest:	// // Constructs End-Points for Clients
								// console.log('RESTING!!!!');
								break;;
							case  page:	// Distibutes Markup for Pages
								// -------------------------------------------------------
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

		/**
		 * ...
		 * @param {CFG.SPCE.Space} space 
		 * @param {string} markup 
		 * @returns {AddingSite}
		 */
		function AddSite(space, markup) {
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
				mkup =  markup,
				head = 	{
					'Content-Type':  'text/html; charset=utf-16',
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
			RND = Renders(RFG, REST, Pages);
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
									send = async (htm)=>(res.status(200).send(htm)),
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
											var end, beg = new Date();
										({HTML:html,State:cont} = rnd.Render(pay, lid));
										rnd.HTML = html;
									// -------------------------------------------
										rep  = repl(rnd, lid, cfg);
										htm  = sani(mkup, rep);
											end = (new Date() - beg);
											LG.Server(ssid, 'HYDRATE', `< ${end}ms > ${path}`, 'magenta');
									// -------------------------------------------
											var end, beg = new Date();
										await Promise.all([ send(htm), save(cont) ]);
											end = (new Date() - beg);
											LG.Server(ssid, 'SAVE', `< ${end}ms > ${path}`, 'magenta');
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
					// console.log('HELLO!!!!', req.headers)
					res.redirect(200,'favicon.ico');
					// res.end()
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
						res.header(head);
						rnd = new RND(lid, path);
						// ------
						try {
							if (!!rnd.Call) {
								let { params, query, body, files } = req;
								// ------
								call = rnd.Call(path,params,query,body,files,usr);
								// ------
									var end, beg = new Date();
								ret  = await REST.Remote[call.method](
									call.path, 
									call.params,
									call.query||call.body, 
									call.files
								);
									end = (new Date() - beg);
									LG.Server(ssid, 'CALLER', `< ${end}ms > ${path}`, 'magenta');
							};

								var end, beg = new Date();
							HTM(usr,cfg,lid,rnd,res,ret);
								end = (new Date() - beg);
								LG.Server(ssid, 'SEND', `< ${end}ms > ${path}`, 'magenta');

						} catch (err) { 
							let { message = err.toString(), stack = [] } = err,
								obj = { message, stack: stack.toString().split('\n'), user: usr },
								msg = JSON.stringify(obj, null, '    ');
							console.error(`${refl} CALL CACHE ERROR:`, msg, '\n');
							!!Sites.Error && Sites.Error(req, res);
						};
					},	ssid, 'EXTERNAL', path, 'magenta');
				};
			};
		}

		// HTTP/2  Essential Files
			// const 	ISOP = new Isolate('../src/push.js', {
						// FILES: 	 spaces.PUSH||[],
						// Publics: Publics,
						// mime: 	 mime,
						// LG:		 LG,
					// })
			// PUSH = 	await ISOP.run();
			// console.log('ISOLATE:',PUSH)

		// Configure External/Socket Routes; Initialize the Custom Namespaces, if available
			await MrkSpace(spaces).then(mark => {
				let GBL = spaces.Global, 
					EXP = GBL.expose,
					ULK = (name) => (
						UNLOCKED.push(new RegExp(
							name.replace(/[\w_-]+:(?=[(])/,'')
								.replace(/\/$/,'')
					)	)	),
					HND = [
						/**
						 * Handler for Global Spaces
						 * @param {AddSPCArgs} args The argument object.
						 * @void
						 */
						({ typ, gbl, nme } = args) => { if (gbl) {
							let gme = `gbl-${nme}`; 
							Spaces[gme] = AddSpace({ 
								name:gme, kind:typ, global:true 
							});
							LogSpace(gme, '', 'global');
						}	},
						/**
						 * Handler for Data (auth/rest) Spaces
						 * @param {AddSPCArgs} args The argument object.
						 * @void
						 */
						({ k, acc } = args) => { if (acc) {
							Session.Accessor = Spaces[k]; 
						}	},
						/**
						 * Handler for Page Spaces
						 * @param {AddSPCArgs} args The argument object.
						 * @void
						 */
						({ k, v, typ, nme, stc, sch, url } = args) => {
							if (typ=='page') {
								let rou = Express.Router(), ste, 
									chk = ReqHandle.Check(stc),
									pth = !!sch?sch:url;
								// Add scheme to Unlocked Collection
								!!v.config.page.unlock && ULK(pth);
								// ...
								Sites[k] = ste = AddSite(Assign({},v,{
									config: Assign(v.config)
								}), mark);
								// ...
								rou .get(pth, chk, ste); 
								rou.post(pth, chk, ste);
								API.use('/', rou); 
								LogSpace(nme, '', 'render');
							}
						}
					];
				// ----------------------------------------------------------------
				Imm	.OrderedMap(spaces)
					.filter((v,k)=>(
						!['Global','PUSH'].has(k) &&
						v.config.name!='global'
					))
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
						Spaces[k] = AddSpace({ 
							name:nme, kind:typ,
						}); LogSpace(nme, dsc);
						// Handle Globals, Accessors, Sites
						try { HND.map(H => H({ 
							k, v, typ, gbl, acc, nme, stc, sch, url 
						})); } catch (err) {
							console.log('SPERR', err)
						}
				});
				// Connect to Globals ---------------------------------------------
				REST.Start();
			}).catch(_err => {
				// Otherwise, add placeholder NameSpace
				Spaces.Index = AddSpace({ name:'/' });
			});
	}

/////////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	/**
	 * The initializer of the `dffrnt.api` framework.
	 * @kind namespace
	 */
	const 	MAKER = {
				/**
				 * Initializes all of the `Routes` within this application.
				 * @param {ExpressJS} api The initialized `ExpressJS` application.
				 * @param {import('express')} express The `ExpressJS` module.
				 * @param {SESS.App} sess The initialized `session` module.
				 * @param {CFG.Settings} setting The global application settings object.
				 */
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
						});
					// Chain It
					let MK=MAKER.FileRoutes(Setting.Folders)
								.AuthRoutes(REST.Config.AuthP)
								.DataRoutes(REST.Config. EndP)
								.HelpRoutes()
								.SiteRoutes();
					// ------
					return MK;
				},
				/**
				 * Registers folders to be used for fileserving.
				 * @param {CFG.STTG.Folders} R Any folders to add to the fileserve.
				 * @private
				 */
				FileRoutes(R) { AddFolder(R); return MAKER; },
				/**
				 * Registers specified **Authentication** `Routes` to the application.
				 * @param {CFG.PNTS.Routes<CFG.PNTS.Auth.Base>} R The collection of `Route` configurations.
				 * @private
				 */
				AuthRoutes(R) { AddRoutes(R, 'AURequest'); return MAKER; },
				/**
				 * Registers specified **Data** `Routes` to the application.
				 * @param {CFG.PNTS.Routes<CFG.PNTS.Data.Base>} R The collection of `Route` configurations.
				 * @private
				 */
				DataRoutes(R) { AddRoutes(R, 'DBRequest'); return MAKER; },
				/**
				 * Registers specified **Help** `Routes` to the application.
				 * @private
				 */
				HelpRoutes( ) { AddDocuments( ); return MAKER; },
				/**
				 * Registers specified **Space** `Routes` to the application.
				 * @private
				 */
				async SiteRoutes( ) { await AddSpaces(NMSP); return MAKER; },
			};

	module.exports = MAKER;

/////////////////////////////////////////////////////////////////////////////////////
