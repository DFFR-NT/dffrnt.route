
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

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const { Assign, CNAME, Imm, TLS, FromJS } = require('dffrnt.utils');
	const { RouteAU, RouteDB, GNParam, GNDescr, _Defaults, MERGER } = require('dffrnt.confs').Definers();

/////////////////////////////////////////////////////////////////////////////////////
// CONSTANTS/VARIABLES

	let _Document = Imm.OrderedMap({});

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
			constructor({ Kinds, Headers, Params } = config = {}) { 
				this.Defaults = Imm.Map({ Kinds, Headers, Params }).filter(V=>!!V).toJS(); 
			};

		/// PROPERTIES //////////////////////////////////////////////////////////////////////

			/**
			 * The JSON-formatted API Documentation
			 * @type {DocGroup}
			 * @readonly
			 * @memberof Helper
			 */
			get Document() { return _Document.toJS(); }

			/**
			 * Access or Subscribe default `DocKindMaps`, `CLHeaders`, and `GNParams`
			 * @type {DocConfigs}
			 * @memberof Helper
			 */
			get Defaults(   ) { return this._defaults.toJS(); }
			set Defaults(val) { 
				let pkey = 'Params', 
					dflt = _Defaults.mergeDeepWith(MERGER, FromJS(val||{})),
					prms = dflt.get(pkey); 

				dflt = dflt.set(pkey, prms.map((V, K) => (
					// console.log(K, CNAME(V)),
					CNAME(V)=='String' ? prms.get(V) : V
				))); 

				this._defaults = dflt;
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
					let RGX = new RegExp(`^${(Route||'').replace(/^\/help|\/$/,'')}$`),
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
			Create	(Name) { !_Document.has(Name) && (
					_Document = _Document.set( Name, Imm.OrderedMap({}) )
				); 
			}

			/**
			 * Formats and subscribes a Route Documentation
			 * @param {string} Name The namespace the Route belongs to
			 * @param {RouteCFG} RQ The Route to be documented
			 * @memberof Helper
			 */
			Append	(Name, RQ) {
				var Route = TLS.Path([Name].concat(RQ.Routes||[],[RQ.Name])), Prams = {}, Examp = {},
					Infos = TLS.Fill(RQ.Doc || {}, { Methods: 'Unknown', Headers: {}, Examples: {} });

				// Setup Parameters
				switch (true) {
					case !!RQ.Doc.Params: 	Prams = RQ.Doc.Params; break;;
					case 	 !!RQ.Params: 	Prams = Imm	.OrderedMap(RQ.Params)
														.filter((doc) => !!doc)
														.map((doc) => { return Assign({}, (
															!!doc.Desc.toDoc ? doc.Desc.toDoc() : (doc.Desc||{})
														), { default: doc.Default }); });
														break;;
					default: 				Prams = this.Error('Parameter', RQ.Name)
				}

				// Setup Examples
				switch (true) {
					case !!RQ.Doc.Examples:
						Object.keys(Infos.Examples || {}).map((ex, e) => {
							var link = TLS.Path([Route, ex]).replace(/\s/g, '%20');
							Examp[link] = Infos.Examples[ex];
						}); break;;
					default: Examp = this.Error('Examples in this', RQ.Name)
				}

				// Append
				_Document = _Document.setIn(
					[Name,Route], FromJS({
						method: 	Infos.Methods,
						headers: 	Infos.Headers,
						params: 	Prams,
						examples: 	Examp,
				})	);
			}
	};

/////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = Helper;

