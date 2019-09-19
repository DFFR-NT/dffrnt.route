'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CONSTANTS ////////////////////////////////////////////////////////////////////////////////////////////////////////

	const encl = { mch: /^(.+?),?$/, arr: '[$1]', obj: '{$1}' };
	const lstx = { mch: /((?:[\/\w]+([;&]|))+)/, rep: '[$1]' };
	const quox = { mch: /([\/\w]+)/g, rep: '"$1"' };
	const numx = { mch: /"(\d+(?:\.\d+)?|true|false)"/g, rep: '$1' };
	const regx = {
		mch: /^((?:\/\w+)+|\/|$)(\/?(?::\w+:.+?)|)(?:(\?(?:\S+=\S+&?)|))$/,
		pnt: { rep: '"$2",', 	  mch: /(\/(\w+))/g },
		prm: { rep: '"$2":"$3",', mch: /(\/:(\w+):((?:[^\/&=?\s]+;?)+)(?=\/:|))/g },
		qry: { rep: '"$2":"$3",', mch: /(\??(\w+)=([^\/&=?\s]+)(?:&|$))/g },
	};
	const conx = {
		dlm: '<|>',
		esc: {  mch: /(^|[^\\])(")/g, rep: function (slash) {
			return function ($0, $1, $2) { return $1+slash+$2; }
		}	},
		col: { 	mch: /(%s)/g, rep: function (cols, i) {
			var d = conx.dlm; return function ($0, $1) { i++; return "'"+d+cols[i]+d+"'"; }
		}	}
	};
	const defx = { point: [""], params: {}, query: {} };
	const dfsx = JSON.stringify(defx);

	const GLBL = {};

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES /////////////////////////////////////////////////////////////////////////////////////////////////////////

	// require('harmony-reflect');

	GLBL.LOG 		= global.LOG 		= console.log;
	GLBL.CREATE 	= global.CREATE 	= Object.create;
	GLBL.OWNDESC 	= global.OWNDESC 	= Object.getOwnPropertyDescriptor;
	GLBL.Assign 	= global.Assign 	= require('object-assign');
	GLBL.Imm 		= global.Imm 		= require('immutable');
	GLBL.Dff 		= global.Dff 		= require('immutablediff');
	GLBL.isKeyed 	= global.isKeyed 	= Imm.Iterable.isKeyed;
	GLBL.FromJS 	= global.FromJS 	= function FromJS(js) {
		return Imm.fromJS(js, function FJSO(key, val) {
			return isKeyed(val) ? 
				val.toOrderedMap() : 
				val.toList();
		});
	};
	GLBL.ImmIs 		= global.ImmIs 		= Imm.is;
	GLBL.List 		= global.List 		= Imm.List;
	GLBL.Map 		= global.Map 		= Imm.Map;
	GLBL.OrdMap 	= global.OrdMap 	= Imm.OrderedMap;
	GLBL.Set 		= global.Set 		= Imm.Set;
	GLBL.OrdSet 	= global.OrdSet 	= Imm.OrderedSet;
	GLBL.Stack 		= global.Stack 		= Imm.Stack;
	GLBL.Seq 		= global.Seq 		= Imm.Seq;
	GLBL.Record 	= global.Record 	= Imm.Record;
	GLBL.GenID 		= global.GenID 		= require('password-generator');
	GLBL.DOHASH 	= global.DOHASH 	= function (obj) { return JSON.stringify(btoa(jsn)); };
	GLBL.UNHASH 	= global.UNHASH 	= function (hsh) { return JSON.parse(atob(hsh)); 	 };
	GLBL.classN 	= global.classN 	= require('classnames');
	GLBL.ALLSTUFF 	= global.ALLSTUFF 	= Map({});


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// POLY-FILLS ///////////////////////////////////////////////////////////////////////////////////////////////////////

	//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// OBJECT

		// OBJECT ASSIGN
			if (!Object.assign) {
				Object.assign = Assign;
			}


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// ARRAY

		// HAS ITEM
			if (!Array.prototype.hasOwnProperty('has')) {
				Object.defineProperty(Array.prototype, 'has', {
					enumerable: false, configurable: false, writable: false,
					value: function (val) {
						var ths = this; return !Array.isArray(val) ? ths.indexOf(val) > -1 :
						val.filter(function (v) { return ths.indexOf(v)>-1 }).length > 0;
					},
				});
			}

		// LAST ITEM
			if (!Array.prototype.hasOwnProperty('last')) {
				Object.defineProperty(Array.prototype, 'last', {
					enumerable: false, configurable: false,
					get: function getLast ( ) { return this[(this.length-1)]; },
					set: function setLast (v) { this[(this.length-1)] 	=  v; },
				});
			}

		// SAVE INDEX
			if (!Array.prototype.hasOwnProperty('safeIndex')) {
				Object.defineProperty(Array.prototype, 'safeIndex', {
					enumerable: false, configurable: false, writable: false,
					value: function (idx, dir) {
						dir = ([-1,1].has(dir) ? dir : 1);
						var len = this.length,
							beg = 0, end = len-1,
							def = { '1': beg, '-1': end },
							not = def[dir],
							nxt = (idx+dir),
							can = nxt.amid(beg,end,1),
							res = (can ? nxt : not);
						return res;
					},
				});
			}


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// NUMBER

		// NUMBER IS BETWEEN
			if (!Number.prototype.hasOwnProperty('amid')) {
				Number.prototype.amid = function(a, b, eq) {
					var min = Math.min.apply(Math, [a, b]),
					max = Math.max.apply(Math, [a, b]);
					switch (Number(!!eq)) {
						case 0: return this> min && this< max;
						case 1: return this>=min && this<=max;
					}
				};
			}


	//////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// STRING

		// TEXT APPEARANCES
			if (!String.prototype.hasOwnProperty('appears')) {
				String.prototype.appears = function (char) {
					var reg = new RegExp(char, 'g');
					return (this.match(reg) || []).length;
				};
			}

		// DUPLICATE
			if (!String.prototype.hasOwnProperty('dup')) {
				String.prototype.dup = function (amount) {
					var amt = amount+1; return new Array(amt).join(this);
				}
			}

			if (!String.prototype.hasOwnProperty('poop')) {
				String.prototype.poop = function () {
					return this.replace(/(\b\w+\b)/g, 'poop');
				}
			}


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS ////////////////////////////////////////////////////////////////////////////////////////////////////////

	GLBL.EXTEND = global.EXTEND 	= function (sup, base, handlers) {
		try { var descriptor, handles, proxy;
			// -----------------------------------------------------------
			descriptor = OWNDESC(base.prototype, 'constructor');
			base.prototype = CREATE(sup.prototype);
			// -----------------------------------------------------------
			handles = Assign({
				construct: function (target, args) {
					var pro = CREATE(base.prototype),
						obj = new Proxy(pro, handlers || {});
					this.apply(target, obj, args); return obj;
				},
				apply: function (target, that, args) {
					if (!(that instanceof base)) return this.construct(target, args);
					var s = sup.apply(that, args), b = base.apply(that, args);
				}
			}, handlers || {});
			proxy = new Proxy(base, handles); descriptor.value = proxy;
			DEFINE(base.prototype, { constructor: descriptor });
			// -----------------------------------------------------------
			return proxy;
		} catch (e) {
			base.prototype = CREATE(sup.prototype);
			DEFINE(base.prototype, { constructor: descriptor });
			return base;
		}
	}
	GLBL.PROPS 	= global.PROPS 		= function (value, descript) {
		var def, val, prp, iGS, dsc = (descript || {});
		try {
			def  = { enumerable: !!dsc.E, configurable: !!dsc.C };
			iGS  = !!value && HASANY(value, ['get', 'set']);
			val  = (!!iGS ? value : { writable: !!dsc.W, value: value });
			prp  = Assign(def, val);
		} catch (e) {
			console.log(e);
		}
		return prp;
	}
	GLBL.HASANY = global.HASANY 	= function (obj, props) {
		return props.reduce(function (p, c) {
			return p + obj.hasOwnProperty(c);
		}, 0);
	}
	GLBL.NOW 	= global.NOW 		= function (offset, fraction) {
		// ---------------------------------------------
		return ((new Date().getTime()+(offset||0))/(fraction||1));
	}
	GLBL.FCHUNK = global.FCHUNK 	= function () {
		var start = NOW(), a = this.a, l = a.length,
			i = this.i, c = this.c, m = this.m,
			f = this.f, diff = (NOW() - start), bnd = {};
		// callback called with args (value, index, array)
		while ((i < l) && (diff <= m)) {
			f.call(c, a[i], i, a); ++i;
			diff = (NOW() - start);
		}
		// set Timeout for async iteration
		bnd = { a: a, c: c, m: m, f: f, i: i };
		if (i < l) setTimeout(FCHUNK.bind(bnd), 1);
	}
	GLBL.FMAP 	= global.FMAP 		= function  (array, func, maxTime, context) {
		FCHUNK.bind({	i: 0,
			a: array, 	c: context||window,
			f: func, 	m: maxTime||200,
		})();
	}
	GLBL.DEFINE = global.DEFINE 	= function (proto, properties) {
		// Just a Wrapper to Shorten the Call
		Object.defineProperties(proto, properties);
	}
	GLBL.MAX 	= global.MAX 		= function (arr) {
		return (arr.sort(function (a, b) {
			return b.length - a.length;
		})[0]||'');
	}
	GLBL.MIN 	= global.MIN 		= function (arr) {
		return (arr.sort(function (a, b) {
			return a.length - b.length;
		})[0]||'');
	}
	GLBL.IS 	= global.IS 		= function (arg) {
		var OBJ = false, RET = {}, STR, NAN = true,
			ANS, BLN, DTE, ARR, NMB, NUM, EML, IMG, LNK, SCK, TXT, RAW,
			dReg = /^\d{4}(-\d{2}){2}[T ](\d{2}:){2}\d{2}(?:\.\d{3})?Z?$/,
			lReg = /^(?:<T:.+,U:.+>|(?:\w+:\/)(?:\S+\.|\.\S+)*(?:\/[^\/\s]+)*\/?|(?:\/[^\/\s]+)+\/?)$/,
			sReg = /^SocketLink\{.+\}$/,
			eReg = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i,
			nReg = /^\.?(?:\d+\.){2,}\d+$|^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i,
			iReg = /^(data:image\/gif;base64,)(.+)$/;
		// String Representation
		STR = !!arg ? arg.toString() : '';
		try { NAN = isNaN(eval(arg)); } catch (e) {}
		// Determine Array
		ARR = (arg instanceof Array);
		// Determine Types w/ Regex
		DTE = (!!!ARR&&!!STR.match(dReg));
		EML = (!!!ARR&&!!STR.match(eReg));
		LNK = (!!!ARR&&!!STR.match(lReg));
		SCK = (!!!ARR&&!!STR.match(sReg));
		IMG = (!!!ARR&&!!STR.match(iReg));
		NUM = (!!!ARR&&!!STR.match(nReg));
		// Determine Types w/o Regex
		BLN = (typeof(arg) == 'boolean');
		NMB = (!(NUM||ARR||BLN||DTE||NAN));
		TXT = (!(SCK||IMG||EML||LNK||NMB||DTE) && NAN && typeof(arg) == 'string');
		RAW = (arg instanceof RegExp);
		// Fill-In Return
		ANS = Imm.Map({
			'date': 	(DTE),
			'email': 	(EML),
			'link': 	(LNK),
			'socket': 	(SCK),
			'image': 	(IMG),
			'boolean': 	(BLN),
			'string': 	(TXT),
			'raw': 		(RAW),
			'number': 	(NMB),
			'numeric': 	(NUM),
			'array': 	ARR,
			'null': 	NIL(arg),
			'object': 	false
		});
		// Determine IF Object
		ANS.map(function (V, K) {
			OBJ = !OBJ ? (V ? 1 : 0) : 1;
		});
		RET = ANS.toJS(); RET.object = !OBJ;
		// Return Answers
		return Object.keys(RET).filter(function (v) { return RET[v]; })[0];
	}
	GLBL.NIL 	= global.NIL 		= function (val) { return [undefined,null].indexOf(val) > -1; }
	GLBL.UoN 	= global.UoN 		= function (val, def, log) { var is = NIL(val); return (!!def ? (is?def:val) : is); }
	GLBL.IaN 	= global.IaN 		= function (val) { return !NIL(val) && !isNaN(val); }
	GLBL.dateFrm= global.dateFrm 	= function (date) {
		try {
			if (!!date) {
				var reg = /^(\d{4}(?:-\d{2}){2})[T ]((?:\d{2}:){2}\d{2})(?:\.\d{3})?Z?$/,
					mch = date.match(reg), dL = "en-US", dateF 	= {
						year: "numeric", month: "short", day: "numeric",
						hour: "2-digit", minute: "2-digit"
					},
					stm = new Date(!!mch ? mch[1]+'T'+mch[2]+'.000Z' : ''),
					dte = stm.toLocaleDateString(dL, dateF),
					tme = stm.toLocaleTimeString(dL, dateF);
				return (dte == tme) ? dte : (dte+' '+tme);
			} else { return "null"; }
		} catch (e) { console.log("%s\n", date, e); }
	}
	GLBL.Lng2IP = global.Lng2IP 	= function (num) {
		if (!isNaN(num)) {
			var OCT = function(nm, base) { return ((nm >> base) & 255); },
				O1 = OCT(num,  0), O2 = OCT(num,  8), O3 = OCT(num, 16), O4 = OCT(num, 24);
			return O4 + "." + O3 + "." + O2 + "." + O1;
		} else { return num; }
	}
	GLBL.IP2Lng = global.IP2Lng 	= function (ip) {
		if (isNaN(ip)) {
			var OCT = ip.split('.').reverse(), Res = 0;
			OCT.map(function (oc, o) { Res += (parseInt(oc) * Math.pow(256, o)); });
			return Res;
		} else { return ip; }
	}
	GLBL.ARGS 	= global.ARGS 		= function (args, from) {
		return Array.prototype.slice.call(args)
					.slice(from || 0);
	}
	GLBL.TC 	= global.TC 		= function (txt) {
		return txt.replace(/\b([a-z])/g, function ($0,$1) {
			return $1.toUpperCase();
		});
	}
	GLBL.SOCKET = global.SOCKET 	= function (options) {
		// -----------------------------------------------------------------------
		var mtch, pnts, prms, qrys, sock, json, link, rslt,
			opts = Assign({ link: "/", escapes: 1 }, options||{}),
			cls  = 'SocketLink', as = { as: 'item' };
		// -----------------------------------------------------------------------
		try {
			link = 	opts.link;
			switch (IS(link)) {
				case 'link':
					mtch = 	link.match(regx.mch);
					pnts = 	mtch[1] .replace(regx.pnt.mch, regx.pnt.rep)
									.replace(encl.mch, encl.arr);
					prms = 	mtch[2] .replace(regx.prm.mch, regx.prm.rep)
									.replace(encl.mch, encl.obj);
					qrys = 	mtch[3] .replace(regx.qry.mch, regx.qry.rep)
									.replace(encl.mch, encl.obj);
					sock = 	{
						point: 	JSON.parse(pnts||'""'),
						params: JSON.parse(prms||'{}'),
						query: 	Assign(as,JSON.parse(qrys||'{}')),
					}; break;;
				case 'object': sock = Assign({}, defx, link); break;;
			}
			json = 	JSON.stringify(sock);
			rslt = 	(cls+json);
		// -----------------------------------------------------------------------
		} catch (e) {
			console.log("\n[%s]:", e.message, {
				opts: opts, mtch: mtch, pnts: pnts, prms: prms,
				qrys: qrys, sock: sock, json: json, rslt: rslt
			}); rslt = 	cls+dfsx;
		}
		// -----------------------------------------------------------------------
		// console.log("\n\tSOCKET: %s\n", rslt);
		return rslt;
	}
	GLBL.FJS 	= global.FJS 		= function (key, val) {
		var idxd = Imm.Iterable.isIndexed(val);
		return idxd ? val.toList() : val.toOrderedMap();
	}
	GLBL.Iter 	= global.Iter 		= {
		Count: 		function (itr) {
			var val = Imm.fromJS(itr);
			try { return val.count(); }
			catch (e) { return 0; };
		},
		CountAll: 	function (data, cond) {
			cond = (cond || function (v,c) { return c; });
			var ITR   = (data instanceof Array?'List':'Map'),
				count = 0, CA = Iter.CountAll;
			Imm[ITR](data).map(function (v,k) {
				var is 	  = (typeof(v) === 'object'),
					added = (is ? cond(v,CA(v,cond)) : 0);
				count += (1 + added);
			}); return count;
		},
		Indexed: 	function  (val) {
			// ------------------------------------------
			return Imm.fromJS(val).toIndexedSeq().toJS();
		},
		Is: 		function (val) {
			// ------------------------------------------
			return (!!val && typeof(val) === 'object');
		},
		Has: 		function (val) {
			var itr = Imm.fromJS(val);
			if (Iter.Is(itr)) {
				itr = itr.toArray();
				for (var i=0; i<itr.length; i++) {
					if (Iter.Is(itr[i])) return true;
				};
			}; return false;
		},
	}
	GLBL.INPUT 	= global.INPUT 		= {
		Priority: function (priority) {
			// -----------------------------------------------
			switch (priority) {
				case  true: return '*';
				case false: return ' ';
				default: 	return '~';
			}
		},
		InValid: function (nput, name, fill) {
			// -----------------------------------------------
			var dflt = INPUT.Attr(nput,'data-default'),
				prty = INPUT.Attr(nput,'data-priority'),
				valu = nput.value;
			fill.push({
				name:  name, type:  prty,
				valid: (prty==" "||!!valu||!!dflt)
			});
		},
		Has: function (elm, attr) {
			// -----------------------------------------------
			return elm.hasAttribute(attr);
		},
		Attr: function (elm, attr) {
			// -----------------------------------------------
			return elm.getAttribute(attr);
		},
		Attrs: function (elm, attrs) {
			// -----------------------------------------------
			var res = {}; attrs.map(function (a,i) {
				var key = a.replace(/-([a-z])/g, function ($0, $1) {
					return $1.toUpperCase();
				}); res[key] = elm.getAttribute(a);
			}); return res;
		},
		Email: function (email) { return 'mailto:'+email; },
	}
	GLBL.CSS 	= global.CSS 		= {
		Declare: function (selectors, properties) {
			var res = selectors.join(' ')+' {\n' +
				properties.map(function (v,i) {
					return CSS.Property.apply(CSS.Property, v);
				}).join('\n') +
			'\n}';
			return res;
		},
		Property: function (property, value, prefix, important) {
			var prefixed = (!!!prefix ? -1 : null),
				prefixs  = ['-webkit-','-moz-','-o-',''].slice(prefixed),
				suffix 	 = (!!important ? ' !important;' : ';'),
				res 	 = prefixs.map(function (v,i) {
					return ('\t'+v+property+': '+value+suffix);
				}).join('\n'); return res;
		},
		Flex: function (options) {
			var opts = (options || {}), f = 'flex', args = ARGS(arguments).slice(1),
				defs = Imm.Map(Assign({ Dir:'Row', Align:'C', Wrap:1 }, opts));
			return  classN.apply(classN,
				args.concat([f].concat(
					defs.map(function (v,k) {
								switch (v) {
									case 0:  return '';
									case 1:  return (f+k);
									default: return (f+k+(v||''));
								}
							}).toArray()
				)) //.join(' ').replace(/(\s{2,})/g, ' ').trim();
			);
		},
	}


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CLASSES //////////////////////////////////////////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// CLASS.CONSTANTS //////////////////////////////////////////////////////////////////////////////////////////

		var   OBIDs 	= Imm.Map({});
		const tObjOmit 	= Imm.List([
			'parent','group','toObject','toLog','to','path','toDepth','is','hasIn','getIn','setIn']);


	/////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// CLASS.STATICS ////////////////////////////////////////////////////////////////////////////////////////////

		function getID   (id) {
			var ID = id; while ((!!!ID || OBIDs.has(ID))) {
				ID = GenID(9, false, /[\w\d]/);
			}; 	OBIDs = OBIDs.set(ID,ID); return ID;
		}
		function toLog 	 () { !!this.debug && console.log.apply(console, ARGS(arguments)); }
		function toObject() { return this.cache; }
		function toDepth (depth) { return (path.length <= depth) ? this.cache : null; }


	/////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// CLASS.ITEMS //////////////////////////////////////////////////////////////////////////////////////////////

		var ITEMS 	= function ITEMS (data, parent, master) {},
			itmsLog = function itmsLog (k,v) {
				var key = (k+':'+v); if (!ALLSTUFF.has(key)) {
					ALLSTUFF = ALLSTUFF.set(key, key);
				}
			},
			itmsCfg = function itmsCfg (key, val, res) {
				var me = this; me.keys.push(key); me.size++;
				me.cache[key] = res.toObject(); !res.iter && itmsLog(key,val);
			},
			itmsMap = function itmsMap (v,k) {
				var me = this, hash = me.hash, res = new ITEM(k, v, {
						group: me, parent: me.parent, master: me.master
					}), tmp = ITEMS.temps[hash];
				if (!!hash) {
					tmp[k] = {}; tmp[k][res.type] = {
						iter: 	res.iter, 	size: 	res.size,
						type: 	res.type, 	alone: 	res.alone,
				}; 	}; 	itmsCfg.bind(me)(k,v,res);
				// console.log('\t\t\t\t\tMAPPED:', k)
				return PROPS(res, itmsDsc);
			},
			itmsTmp = function itmsTmp (v,k) {
				var me = this, hash = me.hash, res = new ITEM(k, v, {
						group: me, parent: me.parent, master: me.master
					}, ITEMS.temps[hash][k][IS(v)]); itmsCfg.bind(me)(k,v,res);
				// console.log('\t\t\t\t\tTEMPED:', k)
				return PROPS(res, itmsDsc);
			},
			itmsItm = function itmsItm (v,k) {
				var me = this, res = v; itmsCfg.bind(me)(k,v,res);
				// console.log('\t\t\t\t\tITEMED:', k)
				return PROPS(res, itmsDsc);
			},
			itmsHsh = function itmsHsh (hash, key, type) {
				var tmp;
				if (tmp = ITEMS.temps[hash], !!tmp) {
					if (tmp = tmp[key], !!tmp) {
						if (tmp = tmp[type], !!tmp) return true;
				}; 	}; 	return false;
			},
			itmsGST = function itmsGST (prop, getter, setter, enumer, config) {
				var def = {};
				!!getter && (def.get = function () { return this.cache[prop]; });
				!!setter && (def.set = function (v) { this.cache[prop] = v;   });
				return PROPS(def, { E: enumer, C: config });
			},
			itmsWch = { array: Imm.List, object: Imm.OrderedMap },
			itmsDsc = { E: 1, W: 1, C: 1 };
		/////////////////////////////////////////////////////////////////////////////////////////////////////////
		DEFINE(ITEMS.prototype, {
			////////////////////////////////////////////////////////////////////////////////
			_omit: 		PROPS(tObjOmit, { E: 0, C: 0, W: 0 }),
			toObject: 	PROPS(toObject, { E: 1, C: 0, W: 0 }),
			toLog: 		PROPS(toLog, 	{ E: 0, C: 0, W: 0 }),
			toDepth: 	PROPS(function toDepth (depth, self, offset) {
				var THS = this, keys = THS.keys, res = {}, ofs = offset||0;
				keys.map(function (k,i) {
					res[k] = THS[k].toDepth(depth, self, ofs);
				});
				return res;
			}, 	{ E: 0, C: 0, W: 0 }),
			toEmpty: 	PROPS(function toEmpty () {
				var TH = this, data = (TH.type=='array'?[]:{});
				return ITEMS(data, null, null);
			}, 	{ E: 0, C: 0, W: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			store: 		PROPS({
				get: function ( ) { return this._store||this.parent.store; },
				set: function (v) {
					try { var path = v[0], data = Imm.fromJS(v[1],FJS);
						if (!!!this._store) this.parent.store = v;
						else this._store = this._store.setIn(path, data);
					} catch (e) { console.log('SET ERROR', e.message, path); }
				}
			}, { E: 0, C: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			map: 		PROPS(function map (callback) {
				var THS = this;
				return this.keys.map(function (k,i) {
					return callback(THS[k],k,i);
				});
			}, { E: 1, C: 0, W: 0 }),
			filter: 	PROPS(function map (callback) {
				var THS = this, rslt = [];
				this.keys.map(function (k,i) {
					var v = THS[k];
					callback(v,k,i) && rslt.push(v);
				}); return rslt;
			}, { E: 1, C: 0, W: 0 }),
			slice: 		PROPS(function slice (start, end) {
				var THS = this; return this.keys.slice(start,end).map(function (k,i) {
					return THS[k];
				});
			}, { E: 1, C: 0, W: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			_path: 		itmsGST('_path', 	true, false, true,  false),
			size: 		itmsGST('size', 	true, true,  false, false),
			keys: 		itmsGST('keys', 	true, true,  true,  false),
			type: 		itmsGST('type', 	true, true,  false, false),
			////////////////////////////////////////////////////////////////////////////////
			is: 		PROPS(function is (to, at, obj) {
				var nxt = Imm.fromJS(obj).getIn(at),
					prv = this.store.getIn(to);
				return Imm.is(prv, nxt)!==false;
			}, { E: 0, C: 0, W: 0 }),
			hasIn: 		PROPS(function hasIn (path) {
				var input = this, end = (path.length-1), res = false;
				try { path.map( function (v,i) {
					if (i!=end) { input = input[v].value; }
					else { res = !!input[v]; }
				}); } catch (e) { res = false; }
				finally { return res; }
			}, { E: 0, C: 0, W: 0 }),
			getIn: 		PROPS(function getIn (path) {
				var input = this, prput, end = (path.length-1), res,
					stat = true, fpth = input._path;
				path.map( function (v,i) {
					if (v != fpth[i] && stat) {
						if (!!!input[v]) { res = prput; stat = false; }
						else if (i!=end) { prput = input[v]; input = prput.value; }
						else { res = input[v]; }
					}
				}); return { Child: res, Parent: this };
			}, { E: 1, C: 0, W: 0 }),
			setIn: 		PROPS(function setIn (path, data) {
				var mch = function (r) { return function (v,i) { return v.match(r); }; },
					ths = this, input = ths, end = (path.length-1), sze = this.size,
					has = this.hasIn(path), gti, res;

				gti = ths.getIn(path)
				// console.log('\t\tSIZE:',sze,'| HAS:',has,'| PATh:',path, gti)

				// if (sze == 0 || (has && !!gti.Child)) {

					// var pth, key;
					// input = gti.Child;
					// pth = path.filter(function (v) { return !input._path.has(v); });

					// delete input.value;

					// if (pth.length>0) {
					// 	key = pth.last;
					// 	input.value.add(key, data);
					// } else {
					// 	input.value = data;
					// 	res = input;
					// }

					path.map( function (v,i) {
						if (i!=end) { input = input[v].value; } else {
							// delete input[v].value;
							input[v].value = data; res = input[v];
					} 	});

					return { Child: res, Parent: this };
				// } else {
				// 	Object.keys(data).map(function (k,n,a) {
				// 		var pth = []; path.map(function (v,i) {
				// 			var r = new RegExp('^'+v+'$'), m = k.match(r);
				// 			pth.push(!!m ? k : v);
				// 		});	ths.setIn(pth, data[k]);
				// 	}); res = ths.getIn(path); return res;
				// };
			}, { E: 0, C: 0, W: 0 }),
			deleteIn: 	PROPS(function deleteIn (path, data) {
				try { 	res = ths.getIn(path.slice(0,-1));
						delete res[path.slice(-1)]; }
				catch (e) { } finally { return true; }
			}, { E: 0, C: 0, W: 0 }),
			update: 	PROPS(function update (path, diff, data, prefix) {
				var ths = this, input, res = {}; input = ths.getIn(path).Child;
				input.value = data; return ths.getIn(path);
			}, { E: 0, C: 0, W: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			replace: 	PROPS(function replace (key, val) {
				var ths = this, has = ths.keys.has(key), nu, prp = {},
					tab = '\t'.dup(ths._path.length);

					// console.log(tab, 'KEY:', key, 'of', JSON.stringify(ths.keys))

				if (has) {
					nu = ths[key];
					nu.value = val;
					// console.log('\t'+tab,'REPLACE', key, val)
					delete ths[key];
					ths.add(key, nu);

					// console.log('\t'+tab, JSON.stringify(ths.toObject()))
				} else {
					// console.log('\t'+tab,'ADD', key)
					ths.add(key, val);
				}
			}, { E: 0, C: 0, W: 0 }),
			add: 		PROPS(function add (key, val) {
				var ths = this, res = {};
				res[key] = this._mapper(val,key);
				DEFINE(ths, res);
			}, { E: 0, C: 0, W: 0 }),
			fill: 		PROPS(function fill (data) {
				var ths = this, hash = ths.hash, type = IS(data),
					keys = ths.keys, res = {}, map, iter,
					fnc = ths._mapper.bind(ths), s = 20, b = 0, e = s,
					mpr = function () {
						DEFINE(ths, iter.map(fnc).toObject());
						b += s; e += s; iter = map.slice(b,e);
					};
				// ------------------------------------------------------
				if (!!hash && !!!ITEMS.temps[hash]) ITEMS.temps[hash] = {};
				// ------------------------------------------------------
				try { map = itmsWch[type](data); }
				catch (e) { console.trace(e); map = itmsWch.array; }
				if (iter = map.slice(b,e), mpr(), iter.size > 0) {
					setTimeout(function () { while (!!iter.count()) mpr(); }, 500);
				}
			}, { E: 0, C: 0, W: 0 }),
			_mapper:  	PROPS(function _mapper (val, key) {
				var ths = this, prp = ((val instanceof ITEM ?
						itmsItm : (itmsHsh(ths.hash,key,IS(val)) ?
						itmsTmp : itmsMap))).bind(ths)(val,key);
					return prp;
			}, { E: 0, C: 0, W: 0 }),
			////////////////////////////////////////////////////////////////////////////////
		});
		/////////////////////////////////////////////////////////////////////////////////////////////////////////
		ITEMS = EXTEND(ITEMS, function ITEMS (data, parent, master) {
			// ------------------------------------------------------
			var ths  =  this, type = IS(data),
				keys = Object.keys(data),
				id 	 =  getID(typeof(master)=='string'?master:null), 
				mast = (master||(parent||{}).master),
				max  =  MAX(keys).length,
				hash = 	keys.toString().replace(/\d+,?/g,'')
							.replace(/^(.+)$/,'{'+mast+':[$1]}');
			// ------------------------------------------------------
			DEFINE(ths, {
				cache: 	PROPS({
					id: id,
					keys: [],
					size: 0,
					map: ths.map,
					slice: ths.slice,
					getIn: ths.getIn,
					type: type,
					toObject: ths.toObject.bind(ths),
					_path: ((parent||{}).path||[])
				}, 						{ E: 0, W: 1, C: 0 }),
				id: 	PROPS(id, 		{ E: 0, W: 0, C: 1 }),
				parent: PROPS(parent, 	{ E: 0, W: 0, C: 0 }),
				master: PROPS(mast, 	{ E: 0, W: 0, C: 0 }),
				hash: 	PROPS(hash, 	{ E: 0, W: 1, C: 0 }),
				debug: 	PROPS(false, 	{ E: 0, W: 1, C: 0 }),
				max: 	PROPS(max, 		{ E: 0, W: 1, C: 0 }),
			});
			if (!!!parent) DEFINE(ths, {
				_store: 	PROPS(Imm.fromJS(data,FJS), { E: 0, W: 1, C: 0 }),
				// _triggers: 	PROPS([], 					{ E: 0, W: 1, C: 0 }),
			});
			// ------------------------------------------------------
			ths.fill(data);
		}, {
			deleteProperty: function deleteProperty (target, prop) {
				if (prop in target) {
					// console.log('TARGET:', target)
					var id = target[prop].id, ky = target.keys,
						pth = target._path.concat(prop);
					// delete target[prop].value;
					// GLBL.TESTY = global.TESTY = target;
					delete target[prop]; delete target.cache[prop];
					// console.log('\tDELETING:', prop, typeof(prop), JSON.stringify(target.toObject()))
					ky.splice(ky.indexOf(prop),1); target.size--;
					OBIDs = OBIDs.delete(id);
					// console.log('DELETED:', prop)
					// target.store = [[],target.store.deleteIn(pth)];
					return true;
				} else { return false; }
			}
		});
		/////////////////////////////////////////////////////////////////////////////////////////////////////////
		ITEMS.getItems 	= function (data, parent, master) {
			switch (true) {
				case NIL(data): 				return 'null';
				case data instanceof ITEMS:
				case data instanceof  ITEM:
				case !(typeof(data)=='object'): return data;
				default: return new ITEMS(data, parent, master);
			}
		}
		ITEMS.temps = {};


	/////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// CLASS.ITEM  //////////////////////////////////////////////////////////////////////////////////////////////

		var ITEM = function ITEM (key, value, config, template) {}
		/////////////////////////////////////////////////////////////////////////////////////////////////////////
		DEFINE(ITEM.prototype, {
			////////////////////////////////////////////////////////////////////////////////
			_omit: 		PROPS(tObjOmit, { E: 0, C: 0, W: 0 }),
			toObject: 	PROPS(toObject, { E: 1, C: 0, W: 0 }),
			toLog: 		PROPS(toLog, 	{ E: 0, C: 0, W: 0 }),
			toDepth: 	PROPS(function toDepth (depth, self, offset) {
				var TH  = this, pth = TH.path,  len = pth.length,
					ofs = (!!self ? len : (offset||0)),
					can = (len-ofs <= depth),
					to  = (can?'toDepth':'toEmpty');
				console.log('%sDEPTH: %d <= %d |', '\t'.dup(len), len-ofs, depth, TH.value)
				return !TH.iter ? TH : TH.value[to](depth, false, ofs);
			}, 	{ E: 0, C: 0, W: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			iterHas: 	PROPS(function iterHas (data) {
				var ths = this, keys = ths._value.keys;
				return FromJS(data,FJS).filter(
					function filter (v,k) { return keys.has(k); }
				).size > 0;
			}, 	{ E: 0, C: 0, W: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			store: 		PROPS({
				get: function ( ) { return this.group.store; },
				set: function (v) { this.group.store = v; }
			}, { E: 0, C: 0 }),
			////////////////////////////////////////////////////////////////////////////////
			iter: 		itmsGST('iter', 	true, true, true, false),
			path: 		itmsGST('path', 	true, true, true, false),
			type: 		itmsGST('type', 	true, true, true, false),
			alone: 		itmsGST('alone', 	true, true, true, false),
			size: 		itmsGST('size', 	true, true, true, false),
			inside: 	itmsGST('inside', 	true, true, true, false),
			////////////////////////////////////////////////////////////////////////////////
			value: 		PROPS({
				get: function ( ) { return this._value; },
				set: function (v) {
					var ths = this, prnt = ths.parent, oter = this.iter,
						iter = Iter.Is(v), val,
						merge = function merge () {
							// console.log('\tREPLACED!!!')
							FromJS(v,FJS).map(function (vl,ky) {
								ths._value.replace(ky,v[ky]);
							}); val = ths._value;
						},
						insert = function insert () {
							// console.log('\sCREATED!!!')
							ths._value = val = ITEMS.getItems(v, ths);
						};
					ths.iter 	= iter;
					ths.path  	= prnt.path.concat([ths.name]);
					ths.store   = [ths.path, v];
					ths.type 	= IS(v);
					// console.log('\t', ths.name, oter, iter)
					if ((!!oter && !!iter) && ((ths._value||{size:0}).size > 0)) {
						ths.iterHas(v) && merge() || insert();
					} else { insert(); }
					ths.size 	= ths.value.size||1;
					ths.cache.value = (!!val.toObject ? val.toObject() : val);
					ths.alone   = (!!!iter||(
						(ths.type=='array' && ths.size<2) &&
						(val.filter(function(v){return!v.alone;}).length==0)
					)	);
				},
			}, { E: 1, C: 0 }),
			////////////////////////////////////////////////////////////////////////////////
		});
		/////////////////////////////////////////////////////////////////////////////////////////////////////////
		ITEM = EXTEND(ITEM, function ITEM (name, value, config, template, custID) {
			// -------------------------------------------------------------
				var id = getID(custID), len = (name||'').length, 
					parent, master, group, inside, max, pad, c, val;
			// -------------------------------------------------------------
				parent = (config.parent || { path: [], master: id });
				master = (config.master || parent.master);
				group  = (config.group||{});
				inside = (group.type||'null');
			// -------------------------------------------------------------
				max = !!group ? group.max : 0;
				pad = (len<max) ? new Array((max+1)-len) : [];
			// -------------------------------------------------------------
				c = Assign({
					master: master,	iter: 	false,
					id: 	id,		name: 	name,
					path: 	[], 	pad: 	pad,
					size: 	0, 		alone: 	true,
					type: 	'null', inside: inside,
					value: 	null,   toObject: this.toObject.bind(this)
				}, template||{});
			// -------------------------------------------------------------
				DEFINE(this, {
					cache: 	 PROPS(c, 			{ E: 0, C: 0, W: 1 }),
					parent:  PROPS(parent, 		{ E: 0, C: 1 }),
					group: 	 PROPS(group, 		{ E: 0, C: 1 }),
					id: 	 PROPS(c.id, 		{ E: 1 }),
					name: 	 PROPS(c.name, 		{ E: 1 }),
					master:  PROPS(c.master, 	{ E: 1 }),
					pad: 	 PROPS(c.pad, 		{ E: 1, W: 1, C: 1 }),
					_value:  PROPS(c.value, 	{ E: 0, W: 1, C: 1 })
				});
			// -------------------------------------------------------------
				if (!!!template) { this.value = value; }
				else {
					this.path  	= parent.path.concat([name]);
					this._value = val = ITEMS.getItems(value, this);
					this.cache.value = (!!val.toObject ? val.toObject() : val);
				}
		}, {
			deleteProperty: function deleteProperty (target, prop) {
				if (prop in target) {
					if (prop == 'value') {
						var trg = target[prop], pth = target.path,
							mpr = function (v,k,i) { delete trg[k]; };
						if (target.iter) { trg.map(mpr); }; //target[prop] = null;
						// console.log('\tDELETED:', prop)
						// target.store = [[],target.store.deleteIn(pth)];
					} else { delete target[prop]; }
					return true;
				} else { return false; }
			}
		});


	/////////////////////////////////////////////////////////////////////////////////////////////////////////////
		
		GLBL.ITEMS = global.ITEMS = ITEMS; 
		GLBL.ITEM = global.ITEM = ITEM;


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT ///////////////////////////////////////////////////////////////////////////////////////////////////////////

	module.exports = GLBL;

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
