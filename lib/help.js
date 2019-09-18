
'use strict';

/////////////////////////////////////////////////////////////////////////////////////////////
// DEFINITIONS

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
	 * A collection of `GNParam` instances
	 * @typedef {Object.<string,GNParam>} ParamGroup
	 */

	/**
	 * A collection of Header `GNDescr` objects
	 * @typedef {Object<string,GNDescr>} CLHeader
	 */

	/**
	 * Configurations for the `Helper` class
	 * @typedef  {Object} DocConfigs
	 * @property {DocKindMap} [Kinds] A collection of DocMethod mappings
	 * @property {CLHeader}   [Headers] A collection of Header `GNDescr` objects
	 * @property {ParamGroup} [Params] A collection of `GNParam` instances
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
	
/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const { Assign, CNAME, Imm, TLS, FromJS } = require('dffrnt.utils');
	const { RouteAU, RouteDB, GNParam, GNDescr, _Defaults, PT, MERGER } = require('dffrnt.confs').Definers();
	const { APIDoc } = require('dffrnt.confs').Init().Settings;
	const   OMap = Imm.OrderedMap;

/////////////////////////////////////////////////////////////////////////////////////
// CONSTANTS/VARIABLES

	let OpenAPI   = "3.0.1",
		_Document = FromJS({
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

/////////////////////////////////////////////////////////////////////////////////////
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
				}
			}
			set Defaults(val) { 
				let THS  =  this, head, prms, ppna,
					pkey = 	'Params', hkey = 'Headers', 
					dkey = 	['components','parameters'], 
					skey = 	['components','schemas'], 
					opna = 	_Document.getIn(dkey), 
					dflt = 	_Defaults.mergeDeepWith(MERGER, FromJS(val||{})), 
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
									let typCst = !!(typObj.selects||typObj.regex),
										typRef = typObj.unique(name,typDef),
										typPth = skey.concat([typRef]);
									// if (typCst) {
									// if (_Document.hasIn(typPth)) {
									// 	typRef = typObj.unique(ref);
									// 	typPth = skey.concat([typRef]);
									// };
									// console.log(ref)
									if (_Document.hasIn(typPth)) {
										typRef = `${typRef}.${key||ref}`;
										// typRef = typObj.unique(ref);
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
								.filter(p=>!!!p.Desc.hidden)
								.reduce((d,p,n)=>(
									d=GetDoc(d,n,p),
									OMap(p.Version)
										.filter(p=>!!!p.Desc.hidden)
										.map((v,k)=>(d=GetDoc(d,n,v,k))),	
									(p.Aliases||[]).map((a)=>(Helper._aliases[a]=n)),d
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
			 * @returns {HelpERR} The error message object
			 * @memberof Helper
			 */
			Error	(Property, Name) { 
				return { Error: "Sorry, there's no "+Property+" Documentation for ["+Name+"], yet." };	
			}

			/**
			 * Accesses a Help Document for responses
			 * @param {string} Name The namespace the Route belongs to
			 * @param {string} Route The name of the Route
			 * @returns {(DocRoute|HelpERR)}
			 * @memberof Helper
			 */
			Get		(Name, Route) {
				try {
					let RGX = new RegExp(`^${(Route||'').replace(/^\/docs|\/$/,'')}$`),
						Res = _Document.get(Name);
					// Match the Route to a specific Doc; if applicable
					if (!!Res&&!!Route) Res = Res.find((v,k)=>!!k.match(RGX));
					// Return specific Doc or general Doc
					return Res.toJS();
				} catch (e) {
					return this.Error('Help', Name)
				}
			}

			/**
			 * Initializes the creation of a Route Documentation 
			 * @param {string} Name The namespace the Route belongs to
			 * @memberof Helper
			 */
			Create	(Name) { 
				// this.Document
				let tags = "tags", Doc = _Document;
				!Doc.has(Name) && (
					_Document = Doc.set(tags, Doc.get(tags).push(
						Imm.OrderedMap({ name: Name.toLowerCase(), })
				)	)	); 
			}

			/**
			 * Formats and subscribes a Route Documentation
			 * @param {string} Name The namespace the Route belongs to
			 * @param {string[]} Routes The parent-Routes of this Route
			 * @param {string} Point The name of this Route
			 * @param {DocMethod} Method The Method of the Route being documented
			 * @param {RouteCFG} RQ The Route to be documented
			 * @memberof Helper
			 */
			Append	(Name, Routes, Point, Method, RQ) {
				if (!!RQ.isNamespace||Method==="MIDDLEWARE") return;
				// VARIABLES ---------------------------------------------------------------------- //
					let SubRT = Routes||[], Prams = {}, GetParams,
						Tags  = [Name.toLowerCase()].concat(SubRT),
						Methd = Method.toLowerCase(),
						Schms = Helper.GetSchemes(RQ.Path),
						PPram = Helper.GetPathParams(Schms);
				// FUNCTIONS ---------------------------------------------------------------------- //
					GetParams = Helper.GetParamFactory(Method);
				// MAIN      ---------------------------------------------------------------------- //
					PPram.map((pathParams, i) => {
						let Route = '/'+[Name].concat(Schms[i]).join('/').toLowerCase().replace(/\/+/g,'/'),
							Path  = ["paths",Route,Methd];
						// Setup Parameters
							Prams = (
								!!RQ.References ? 
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
									tags: Imm.List(Tags), ...Prams,
									responses: FromJS({
										200: { $ref: '#/components/responses/Success' },
									})
							})	);
					});
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
				let orpl = '|####',
					mtch = path.coalesceMatch(/[(]/g,['']),
					mark = (mtch.reduce(a=>a.replace(/\((?:[^(:)]|:(?!\w))*\)/g,''),
									path.replace(/^\/(?!:)(.+)$/g,'$1')
										.replace(/\)\?\)/g,`)${orpl})`)
										.replace(/[(]\?:/g,'('))
								.match(/([^()]+(?=\/)|\(.+\))/g)||['']);
				return  mark.map(s=>(
								s	.coalesceMatch(/([|]?\/?:\w+\b|[|]####(?=[)])|\b[\w\/]+(?:(?=\/)|$))/g),[s])
									.reduce((a,c)=>(c.match(/^[|]/) ? a.push([c]) : a[a.length-1].push(c), a),[[]])
									.map(m=>m.map(p=>p.replace(/^\|?\/?:(\w+)$/,'{$1}')).filter(m=>m!=orpl))
							)
							.reduce((a,c,i,l,p1,p2)=>(
								a.lvls.push(a.LV<0 ? c : (p1=c,p2=a.params,(
									p1.length>p2.length ? p2.map(p=>p1.map(l=>p.concat(l))) : p1.map(p=>p2.map(l=>l.concat(p)))
								)	)[0]), a.LV++, a.params=a.lvls[a.LV], a
							),{LV:-1,lvls:[],params:[]}).params
			}

			/**
			 * Generates an `Array` of path-parameter `Arrays`, based on the provider schemes
			 * @static
			 * @param {string[]} schemes An `Array` of path schemes
			 * @returns {Array<string[]>}
			 * @memberof Helper
			 */
			static GetPathParams(schemes) {
				return schemes.map(s=>s.filter(p=>!!p.match(/^\{\w+\}$/)))
			}

			/**
			 * Get any Params not already included in the OpenAPI Parameter Components
			 * @static
			 * @param {OAParams} params A collection of `GNDescr` or `GNParam` objects
			 * @returns {OAParamsI}
			 * @memberof Helper
			 */
			static GetNewParams (params) {
				let dkey = ['components','parameters'],
					opna = _Document.getIn(dkey);
				return OMap(params).filter((p,n)=>!!!opna.has(n))
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
				let cls = ['Boolean','Array','String'], cnm = CNAME(ref);
				if (cls.has(cnm)) { switch (cnm) {
					case 'Boolean' : case 'String' : return name;
					case 'Array'   : return [name].concat(ref).join('.');
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
				return (!!!alias?null:[alias,parts[1]].join('.'));
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
			 * @param {DocMethod} method A value specifiying a Request Method
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
			 * @param {DocMethod} method A value specifiying a Request Method
			 * @returns {}
			 * @memberof Helper
			 */
			static GetParamFactory(method) {
				let inSrt = { header:1, path:2, query:3 },
					inEnu = Helper.GetInVals(method);
				// FUNCTIONS ---------------------------------------------------------------------- //

					/**
					 * Formats Path/Header/Query/Body definitions for OpenAPI 3.0
					 * @param {Object<string,GNParam>} params A collection of `GNParam` instances, defining **Path**, **Headers**, **Query** or **Body** parameters
					 * @param {string} [pathParams=[]] The path-parameters of the current `GNRoute`
					 * @returns {Object} A OpenAPI 3.0 formatted object
					 */
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
						return res;
					}

				// MAIN      ---------------------------------------------------------------------- //
					return GetParams;
			}

	};	
	Helper._aliases = {}; 
	Helper._comps   = new Imm.Map({});
	Helper._dups    = {};
	Helper._types   = new Imm.Map({});
	Helper._tups    = {};

/////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = Helper;
