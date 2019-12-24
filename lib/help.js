'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// DEFINITIONS

	/**
	 * @typedef {import('immutable').Map<string,import('immutable').List<string>>} DocIndex
	 */
	/**
	 * @typedef {import('immutable').OrderedMap<string,TPQryObject|TPQryObject[]>} DocContent
	 */
	/**
	 * An JSON object for Error Messages
	 * @typedef {{Error: string}} HelpERR
	 */

	/**
	 * A value specifiying an allowed Request Method
	 * @typedef {'GET'|'POST'|'PUT'|'DELETE'|'MIDDLEWARE'} DocMethod
	 */

	/**
	 * A collection of DocMethod mappings
	 * @typedef  {Object.<string,DocMethod[]>} DocKindMap
	 */

	/**
	 * A `RouteGN` instance or configurator object
	 * @typedef {(RouteAU|RouteDB|Object.<string,any>)} RouteCFG
	 */

	/**
	 * A `RouteGN` documentation
	 * @typedef {Object.<string,any>} DocRoute
	 */

	/**
	 * A collection of `RouteGN` documents
	 * @typedef {Object.<string,DocRoute>} DocRouteGroup
	 */
	
	/**
	 * A collection of `DocRouteGroups`
	 * @typedef {Object.<string,DocRouteGroup>} DocGroup
	 */

	/**
	 * Configurations for the `Helper` class
	 * @typedef  {Object} DocConfigs
	 * @property {DocKindMap} [Kinds] A collection of DocMethod mappings
	 * @property {CLParameters} [Headers] A collection of Header `GNDescr` objects
	 * @property {CLParameters} [Params] A collection of `GNParam` instances
	 */

	/**
	 * A _plain_-`Object` of `GNDescr` or `GNParam` objects (_for `OpenAPI`_)
	 * @typedef {Object<string,(GNParam|GNDescr)>} OAParamsP
	 */
	/**
	 * An `ImmutableJS` `OrderedMap` of `GNDescr` or `GNParam` objects (_for `OpenAPI`_)
	 * @typedef {OMap<string,(GNParam|GNDescr)>} OAParamsI
	 */
	/**
	 * A collection of `GNDescr` or `GNParam` objects (_for `OpenAPI`_)
	 * @typedef {(OAParamsP|OAParamsI)} OAParams
	 */

	/**
	 * A reference to a Defined `GNParam`
	 * @typedef {(GNParam|string|string[]|boolean)} RFParam
	 */
	/**
	 * A collection of `RFParam` references
	 * @typedef {Object<string,RFParam>} RFParams
	 */

	/**
	 * Formats Path/Header/Query/Body definitions for OpenAPI 3.0
	 * @callback CBGetParams
	 * @param {CLParameters} params A collection of `GNParam` instances, defining **Path**, **Headers**, **Query** or **Body** parameters
	 * @param {string[]} [pathParams=[]] The path-parameters of the current `GNRoute`
	 * @returns {TPQryObject} A OpenAPI 3.0 formatted object
	 */
	
/////////////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const { Assign, CNAME, Imm, TLS, FromJS } = require('dffrnt.utils');
	const { RouteAU, RouteDB, GNParam, GNDescr, _Defaults, PT, MERGER } = require('dffrnt.confs');
	const { isIterable: isIter, isKeyed: isKeyd, isIndexed: isNdex } = Imm.Iterable;
	const { APIDoc } = require('dffrnt.confs').Init().Settings;
	const   OMap   = Imm.OrderedMap;

/////////////////////////////////////////////////////////////////////////////////////////////
// CONSTANTS/VARIABLES

	const 	OpenAPI   = "3.0.1";
	const 	RefK      = "$ref";


	/** @type {DocIndex} */
	let 	_Index    = Imm.Map();
	/** @type {DocContent>} */
	let 	_Document = FromJS({
				openapi: OpenAPI,
				info: {
					title: "Untitled API",
					description: "",
					termsOfService: "",
					contact: { 
						name: "Contact Name",
						email: "email.address@domain.com",
						url: "https://domain.com/support",
					},
					license: {
						name: "Apache 2.0",
						url: "http://www.apache.org/licenses/LICENSE-2.0.html"
					},
					version: "1.0.0"
				},
				externalDocs: {},
				servers: [],
				tags:  [],
				paths: {},
				components: {
					schemas: 		 {
						ResultStatus: 	{
							type: 'integer',
							description: "The Exit-Code of the Request"
						},
						ResultOptions: 	{
							type: 'object',
							description: "The Request Meta-Data",
							properties: {
								query: {
									type: 'object',
									description: "The Request Parameters",
									additionalProperties: true,
								}
							}
						},
						ResultLinks: 	{
							type: 'object',
							description: "The Links established for this Request",
							additionalProperties: { type: "string" }
						},
						ResultObject: 	{
							type: 'object',
							properties: {
								status:  { $ref: '#/components/schemas/ResultStatus'  },
								options: { $ref: '#/components/schemas/ResultOptions' },
								links:   { $ref: '#/components/schemas/ResultLinks'   },
								result:  {
									type: 'object',
									description: "A Result Object",
									additionalProperties: true
								},
							}
						},
						ResultArray: 	{
							type: 'object',
							properties: {
								status:  { $ref: '#/components/schemas/ResultStatus'  },
								options: { $ref: '#/components/schemas/ResultOptions' },
								links:   { $ref: '#/components/schemas/ResultLinks'   },
								result:  {
									type: 'array',
									description: "A Result Array",
									items: {
										$ref: '#/components/schemas/ResultObject'
									}
								},
							}
						},
					},
					securitySchemes: {},
					parameters: 	 {},
					requestBodies:	 {},
					examples:		 {},
					links:			 {},
					responses: 		 {
						Success: 	{
							description: "Successful Operation",
							content: { 'application/json': {
								schema: { oneOf: [
									{ $ref: '#/components/schemas/ResultObject' },
									{ $ref: '#/components/schemas/ResultArray'  },
								]	}
							}	}
						}
					}
				}
			})
			.mergeDeep(APIDoc)
			.set('openapi',OpenAPI); 

/////////////////////////////////////////////////////////////////////////////////////////////
// FUNCTIONs

	/**
	 * Checks if an object is an `OpenAPI` reference.
	 * @param {import('immutable').Iterable} iter An `Immutable` iterable object.
	 * @returns {boolean}
	 */
	function isRefd(iter) {
		return iter.has(RefK);
	}

/////////////////////////////////////////////////////////////////////////////////////////////
// CLASSES

	/**
	 * Converts API configurations into a JSON Documentation
	 * @class Helper
	 */
	class Helper {

		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////
			
			/**
			 * Creates an instance of Helper.
			 * @param {DocConfigs} [config] The `Helper` configs
			 */
			constructor({ Kinds = [], Headers = {}, Params = {} } = config = {}) {
				/**
				 * @type {import('dffrnt.confs').DefaultsMap}
				 */
				this._defaults = null;
				this.Defaults = OMap({ Kinds, Headers, Params }).filter(V=>!!V).toJS(); 
				this._aliases = {};
				_Document = _Document.mergeIn(
					['components','schemas'], FromJS(PT.Docs)
				);
			};

		/// PROPERTIES //////////////////////////////////////////////////////////////////////

			/**
			 * The JSON-formatted API Documentation
			 * @type {DocGroup}
			 * @readonly
			 * @memberof Helper
			 */
			get Document() {
				let skey = ['components','schemas'];
				return _Document.setIn(skey,
					_Document.getIn(skey).sortBy(
					(v,k)=>(k), (a,b)=>((a<b)?-1:((a>b)?1:0))
				)).toJS(); 
			}

			/**
			 * Access or Subscribe default `DocKindMaps`, `CLHeaders`, and `GNParams`
			 * @type {DocConfigs}
			 * @memberof Helper
			 */
			get Defaults(   ) {
				let THS = this; return {
					get Kinds	() { return THS._defaults.get('Kinds'	).toJS(); },
					get Headers () { return THS._defaults.get('Headers'	).toJS(); },
					get Params	() { return THS._defaults.get('Params'	).toJS(); },
				};
			}
			set Defaults(val) {
				let THS  =  this, head, prms, ppna,
					pkey = 	'Params', hkey = 'Headers', 
					dkey = 	['components','parameters'], 
					skey = 	['components','schemas'], 
					opna = 	_Document.getIn(dkey), 
					dflt = 	_Defaults.mergeDeepWith(MERGER, FromJS(val||{})), 
					fltr =  (p)=>!!!p.Desc.hidden,
					cnvt = 	(key,coll) => dflt.set(key, 
								coll.filter((v,k)=>!!!opna.has(k))
									.map(V=>(CNAME(V)=='String'?coll.get(V):V)));
				// Convert String-References to Specified GNParam ---------- 
					head = cnvt(hkey, dflt.get(hkey)).get(hkey);
					prms = cnvt(pkey, dflt.get(pkey)).get(pkey);
				// Add Default Parameters to OAPI Schema ------------------- 
					function GetDoc(defs, name, doc, key = null) {
						let res, irs, trs, ref = name, typKey,
							schemas = _Document.getIn(skey), 
							{ _comps, _dups } = Helper;
						// Pre-generate RefKey; grab Docs
							if (!!key) ref = `${name}.${key}`;
							res = doc.toDoc(name); irs = FromJS(res);
						// Handle Defined Types-Schemas
							trs = FromJS(res.schema);
							if (!schemas.includes(trs)) {
								let typDef = (doc.hideDefault?null:doc.Default),
									typObj =  doc.Desc.type;
								if (!!typObj.unique) {
									let typRef = typObj.unique(name,typDef),
										typPth = skey.concat([typRef]);
									if (_Document.hasIn(typPth)) {
										typRef = `${typRef}.${key||ref}`;
										typPth = skey.concat([typRef]);
									};
									_Document = _Document.setIn(typPth,trs);
									schemas   = _Document.getIn(skey)
								}
							};	typKey = schemas.keyOf(trs);
							res.schema = { $ref: `#/components/schemas/${typKey}` };
						// Handle Duplicate Params; then return
							if (_comps.includes(irs)) {
								_dups[ref] = name; res = name; 
								return defs;
							} else {
								Helper._comps = _comps.set(ref,irs);
								return defs.set(ref, res);
							};
					};
					ppna =  head.merge(prms)
								.filter(fltr).reduce((d,p,n)=>(
									d=GetDoc(d,n,p),
									OMap(p.Version)
										.filter(p=>!!p.Derived).filter(fltr)
										.map((v,k)=>(d=GetDoc(d,k,v))),
									OMap(p.Version)
										.filter(p=>!!!p.Derived).filter(fltr)
										.map((v,k)=>(d=GetDoc(d,n,v,k))),
									(p.Aliases||[]).map((a)=>(
										Helper._aliases[a]=n
									)), d
								), 	opna);
					_Document = _Document.setIn(dkey, ppna);
				// Set the Detaults Attribute ------------------------------ 
					THS._defaults = dflt;
			}

		/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

			/**
			 * Formats an JSON object for Error Messages
			 * @param {string} Property The erroring Property
			 * @param {string} Name The erroring Object
			 * @returns {ERHelp} The error message object
			 * @memberof Helper
			 */
			Error	(Property, Name) {
				return { Error: "Sorry, there's no "+Property+" Documentation for ["+Name+"], yet." };	
			}

			/**
			 * Accesses a Help Document for responses
			 * @param {string} Name The namespace the Route belongs to
			 * @param {string} Route The name of the Route
			 * @returns {(DocRoute|ERHelp)}
			 * @memberof Helper
			 */
			Get		(Name, Route) {
				let Res = {}; try {
					let RKY = '$ref',
						PRM = 'parameters',
						ROU = (Route||'').replace(/^\/apidocs(?=\/)|\?.+$|\/$/g,''),
						FND = _Index.find((_v,x)=>!!ROU.match(new RegExp(x))),
						REF = (r)=>(FromJS(_Document.getIn(r.get(RKY).split('/').slice(1)))),
						RJS = (v)=>(isIter(v)?MLS(isRefd(v)?REF(v):v):v),
						MLS = (l)=>(l.map((r)=>RJS(r)));
					// console.log({ Name, Route, ROU })
					FND.map(R => {
						Res[R] = _Document.getIn(["paths",R]);
						Res[R] = Res[R].map((m)=>{
							m = m.delete('tags');
							if (m.has(PRM)) {
								m = m.set(PRM, RJS(FromJS(m.get(PRM))));
							};	return m;
						})
					}	).toJS();
				} catch (e) {
					console.error(e)
					Res = this.Error('Help', Name)
				}; 	return Res;
			}

			/**
			 * Initializes the creation of a Route Documentation 
			 * @param {string} Name The namespace the Route belongs to
			 * @memberof Helper
			 */
			Create	(Name) {
				// this.Document
				let tags = "tags", nme = Name.toLowerCase(), 
					Doc  = _Document, Idx = _Index;
				if (!!!Doc.get(tags).find((v)=>v.get('name')==nme)) {
					_Document = Doc.set(tags, Doc.get(tags).push(
						Imm.OrderedMap({ name: nme })
					)	)
				};
			}

			/**
			 * Formats and subscribes a Route Documentation
			 * @param {string} Name The namespace the Route belongs to
			 * @param {string[]} Routes The parent-Routes of this Route
			 * @param {string} Point The name of this Route
			 * @param {HMETHODs} Method The Method of the Route being documented
			 * @param {(RouteAU|RouteDB)} RQ The Route to be documented
			 * @memberof Helper
			 */
			Append	(Name, Routes, Point, Method, RQ) {
				if (!!RQ.isNamespace||Method==="MIDDLEWARE") return;
				// VARIABLES ---------------------------------------------------------------------- //
					let SubRT = Routes||[], Prams = {},
						Tags  = [Name.toLowerCase()].concat(SubRT),
						Methd = Method.toLowerCase(),
						Schms = Helper.GetSchemes(RQ.PathTemplate),
						PPram = Helper.GetPathParams(Schms);
				// FUNCTIONS ---------------------------------------------------------------------- //
					let GetParams = Helper.GetParamFactory(Method);
				// MAIN      ---------------------------------------------------------------------- //
					PPram.map((pathParams, i) => {
						let Route = '/'+Schms[i].join('/').replace(/\/+/g,'/'),
							Path  = ["paths",Route,Methd], Matcher;
						// Setup Parameters
							Prams = ( !!RQ.References ? 
								GetParams(RQ.References, pathParams): 
								this.Error('Parameter', Point)
							);
						// // Setup Examples
							// switch (true) {
								// case !!RQ.Doc.Examples:
									// Object.keys(Infos.Examples || {}).map((ex, e) => {
										// var link = TLS.Path([Route, ex]).replace(/\s/g, '%20');
										// Examp[link] = Infos.Examples[ex];
									// }); break;;
								// default: Examp = this.Error('Examples in this', Point)
							// }
						// Append
							_Document = _Document.setIn(
								Path, Imm.OrderedMap({
									// summary: null,
									description: "Coming soon...",
									tags: Imm.List(Tags), ...Prams,
									responses: FromJS({
										200: { $ref: '#/components/responses/Success' },
							})	})	);
						// Index
							Matcher = `${Route.replace(/(?:\/[{][\w_-]+[}])+$/, '')
											  .replace(/\/[{]([\w_-]+)[}]\//g,'/[\\w_-]+/')
											  .replace(/\//g,'\\/')}`;
							// Create new Index; if needed
							if (!_Index.has(Matcher)) {
								// console.log(Matcher)
								_Index = _Index.set(Matcher, Imm.List());
							};
							// Add to current Index; if needed
							if (!_Index.get(Matcher).includes(Route)) {
								// console.log('    >', Route, pathParams)
								_Index = _Index.set(Matcher, _Index.get(Matcher).push(Route));
							};
					});
			}

			/**
			 * Finalizes the Documentation by adding the API-Doc route.
			 * @param {string} [Name="apidoc"] The name of the documentation route.
			 */
			Finalize(Name = "apidoc") {
				_Document = _Document.setIn(
					["paths",Name,"get"], Imm.OrderedMap({
						summary: Name,
						description: "Retrieves this API Documentation",
						responses: FromJS({
							200: { $ref: '#/components/responses/Success' },
				})	})	);
			}

		/// STATICS   ///////////////////////////////////////////////////////////////////////

			/**
			 * Splits a path pattern to an `Array` of separate paths
			 * @static
			 * @param {string} path The `RegexP` path to parse
			 * @returns {string[]}
			 * @memberof Helper
			 */
			static GetSchemes(path) {
				let redu =  {LV:-1,lvls:[],params:[]},
					mtch =  path.coalesceMatch(/((?:\{[^|?]+\}|[^{|?}])+(?=\/)|\{.+\|.+\}\??|:\w+\?)/g,['']),
					mark =  mtch.map(s=>(
								s	.coalesceMatch(/([|]?\/?:\w+(?:\/:\w+)*\b|(?=\?)|\b[\w\/]+\b)/g,[s]))
									.reduce((a,c)=>(c.match(/^[|]|^$/) ? a.push([c]) : a[a.length-1].push(c), a),[[]])
									.map(m=>m.map(p=>p.replace(/\|?:(\w+\b)/g,'{$1}')))
							),
					rslt =  mark.reduce((a,c,i,l,p1,p2)=>(
								a.lvls.push(a.LV<0 ? c : (p1=c,p2=a.params,(
									p1.length>p2.length ? p2.map(p=>p1.map(l=>p.concat(l))) : p1.map(p=>p2.map(l=>l.concat(p)))
								)	)[0]), a.LV++, a.params=a.lvls[a.LV], a
							),	redu).params.map(v=>v.filter(v=>!!v));
				return rslt;
			}

			/**
			 * Generates an `Array` of path-parameter `Arrays`, based on the provider schemes
			 * @static
			 * @param {string[]} schemes An `Array` of path schemes
			 * @returns {Array<string[]>}
			 * @memberof Helper
			 */
			static GetPathParams(schemes) {
				let RGX = /\{\b[\w_-]+\b\}/g;
				return schemes.map(s=>(
					s.filter(p=>!!p.match(RGX))
					 .join('')
					 .coalesceMatch(RGX,[])
				)	);
			}

			/**
			 * Formats a Param-Reference Key based on the Specfied `name` & `ref`
			 * @static
			 * @param {string} name The Name of the `Param`
			 * @param {RFParam} ref The `Param` Reference
			 * @returns {(string|boolean)} A formatted Reference Key; or `false`, if invalid
			 * @memberof Helper
			 */
			static MkeRefKey(name, ref) {
				let cls = ['Boolean','Array','String'], cnm = CNAME(ref),
					rdu = (a,c)=>(!a.has(c)&&a.push(c),a);
				if (cls.has(cnm)) { switch (cnm) {
					case 'Boolean' : case 'String' : return name;
					case 'Array'   : return [name].concat(ref)
												  .reduce(rdu, [])
												  .join('.');
				};	};	return false;
			}

			/**
			 * Checks if a `Reference-Key` matches any defined `Param-References`
			 * @static
			 * @param {string} refKey The `Param-Reference` Key
			 * @param {OMap} [refs] An option `Param-Reference` collection (_for speed_)
			 * @returns {boolean} 
			 * @memberof Helper
			 */
			static ChkRefKey(refKey, refs) {
				refs = (refs || _Document.getIn(['components','parameters']));
				return refs.has(refKey);
			}

			/**
			 * Get an aliased `Reference-Key`
			 * @static
			 * @param {string} refKey The `Param-Reference` Key
			 * @returns {string} The real `Param-Reference` Key
			 * @memberof Helper
			 */
			static GetRefAlias(refKey) {
				let parts = refKey.split('.'), alias = Helper._aliases[parts[0]];
				// console.log([alias,parts]);
				return (!!!alias?null:
					[alias,parts[1]]
						.reduce((a,c)=>(!a.has(c)&&a.push(c),a), [])
						.join('.')
				);
			}

			/**
			 * Get a `Reference-Key`
			 * @static
			 * @param {string} refKey The `Param-Reference` Key
			 * @param {OMap} [refs] An option `Param-Reference` collection (_for speed_)
			 * @returns {string} The real `Param-Reference` Key
			 * @memberof Helper
			 */
			static GetRefKey(refKey, refs) {
				let res, chk = Helper.ChkRefKey(refKey,refs);
				if ( !!chk) res = refKey;
				if (!!!chk) res = Helper.GetRefAlias(refKey);
				if (!!!chk) res = Helper._dups[refKey];
				return res;
			}
	
			/**
			 * Returns an appropriate `Object` of `in`-values, given the specified `method`.
			 * @static
			 * @param {HMETHODs} method A value specifiying a Request Method
			 * @returns {Object<string,string>}
			 * @memberof Helper
			 */
			static GetInVals(method) {
				return {
					header: 'header', path: 'path', ...({
						true:  { query: 'query' },
						false: { query: 'body'  }
					})[['GET','DELETE'].has(method)]
				}
			}

			/**
			 * Generates an appropriate `Function` to designate parameters, given the specified `method`.
			 * @static
			 * @param {HMETHODs} method A value specifiying a Request Method
			 * @returns {CBGetParams} A param retrieval function
			 * @memberof Helper
			 */
			static GetParamFactory(method) {
				let inSrt = { header:1, path:2, query:3 },
					inEnu = Helper.GetInVals(method);
				// FUNCTIONS ---------------------------------------------------------------------- //

					/** @type {CBGetParams} */
					function GetParams(params, pathParams = []) {
						let opnapi = _Document.getIn(['components','parameters']),
							enc = 'application/x-www-form-urlencoded',
							res = {
								parameters:  [],
								requestBody: {
									content: {
										[enc]: {
											schema: {
												type: 'object',
												properties: {},
												required: []
											}
										},
									}
								}
							},
							sch = res.requestBody.content[enc].schema;
						// ----------------------------------------------
						OMap(params)
							.map((ref, nme) => {
								let refKey = Helper.MkeRefKey(nme,ref), isRef = false, param;
								// ------
								if (!!refKey) {
									isRef = Helper.ChkRefKey(refKey,opnapi);
									if (!isRef) {
										refKey = Helper.GetRefKey(refKey,opnapi);
										isRef  = Helper.ChkRefKey(refKey,opnapi);
									};	
									if (isRef) {
										param = { ...opnapi.get(refKey), 
											ref: `#/components/parameters/${refKey}` 
										};
									}
								} else {
									param = ref.toDoc();
								};	
								// ------
								if (!!param) {
									param      = { ...param };
									param.name = nme.toLowerCase();
									param.in   = inEnu[param.in];
								}
								// ------
								return param;
							})
							.filter(doc => !!doc)
							.map((doc) => ({ ...doc, rank: inSrt[doc.in] }))
							.sort((a, b) => {
								if (a.rank  <  b.rank) { return -1; }
								if (a.rank  >  b.rank) { return  1; }
								if (a.rank === b.rank) { return  0; }
							})
							.filter((doc) => pathParams.has(`{${doc.name}}`)||doc.in!='path')
							.map(doc => {
								delete doc.rank;
								switch (doc.in) {
									case 'path': case 'header': case 'query':
										if (!!doc.ref) {
											res.parameters.push({ $ref: doc.ref });
										} else {
											res.parameters.push(doc);
										};	break;;
									case 'body':
										let nme = doc.name, rqd = !!doc.required, ema = doc.schema;
										delete doc.name; delete doc.in; delete doc.required; delete doc.schema; delete doc.ref;
										sch.properties[nme] = { ...ema, ...doc }; 
										rqd && sch.required.push(nme);
										break;;
								}
							}).toList()
						// // ----------------------------------------------
						if (!!!res.parameters.length) delete res.parameters;
						if (Imm.Map(sch.properties).isEmpty()) delete res.requestBody;
						if (LIMIT == 0) {
							console.log(res);
							LIMIT = 1;
						}
						return res;
					}

				// MAIN      ---------------------------------------------------------------------- //
					return GetParams;
			}

	};	
	let LIMIT = 0;
	Helper._aliases = {}; 
	Helper._comps   = new Imm.Map({});
	Helper._dups    = {};
	Helper._types   = new Imm.Map({});
	Helper._tups    = {};

/////////////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = Helper;
