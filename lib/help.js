
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const { Assign, Imm, TLS } = require('dffrnt.utils');

	const _Defaults = Imm.fromJS({
				Kinds: 	 { GET: ['GET'], POST: ['POST'], BOTH: ['GET', 'POST'], PUT: ['PUT'], DELETE: ['DELETE'],  MID: ['MIDDLEWARE'] },
				Headers: { Token: { type: "Text", description: "The secret Token Key given upon Sign-Up", required: true  }, },
				Params:  {
					Single: { 	
						Default: 'false', 
						Format  (cls) { return Boolean(eval(((cls.single.toString()||'').match(/^(true|false|1|0)$/)||['false'])[0])); },
						Desc: {
							type: 'Boolean',
							description: 'Return a {{single}} {{User}} only',
							required: false, to: 'query', hidden: false
						}
					},
					Visible: { 	
						Default:  'true', 
						Format  (cls) { return Boolean(eval(((cls.visible.toString()||'').match(/^(true|false|1|0)$/)||['false'])[0])); },
						Desc: { 
							type: 'Boolean', 
							description: 'Toggle {{Visibility}} layer',
							required: false, to: 'query', hidden: false
						}
					},
					Page:  { 	
						Default: 1, 
						Format(cls) { return cls.page; },
						Desc: { 
							type: { Number: { min:  1 } }, 
							description: "The page number of the given results",
							required: false, to: 'query', hidden: false
						}
					},
					Limit: { 	
						Default: 10, 
						Format(cls) { return cls.limit; },
						Desc: { 
							type: { Number: { min: -1 } }, 
							description: "The amount of items displayed per page",
							required: false, to: 'query', hidden: false
						}
					},
					ID: { 	
						Default: '', 
						Format(cls) { return cls.element; },
						Desc: { 
							type: 'Object', 
							description: "A unique ID that is return with the result. This can be used for tracking purposes",
							required: false, to: 'query', hidden: true 
						}
					}
				},
			});

	let _Document = Imm.OrderedMap({});

/////////////////////////////////////////////////////////////////////////////////////
// CLASSES

	class Helper {

		/// CONSTRUCTOR /////////////////////////////////////////////////////////////////////
			
			constructor(config = {}) { 
				this.Defaults = config; 
			};

		/// PROPERTIES //////////////////////////////////////////////////////////////////////

			get Defaults() { return this._defaults.toJS(); }
			get Document() { return _Document.toJS(); }

			set Defaults(val) { this._defaults = _Defaults.mergeDeep(Imm.fromJS(val||{})); }

		/// FUNCTIONS ///////////////////////////////////////////////////////////////////////

			Error	(Property, Name) { 
				return { Error: "Sorry, there's no "+Property+" Documentation for ["+Name+"], yet." };	
			}

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

			Create	(Name) { !_Document.has(Name) && (
					_Document = _Document.set( Name, Imm.OrderedMap({}) )
				); 
			}

			Append	(Name, RQ) {
				var Route = TLS.Path([Name].concat(RQ.Routes || [], [RQ.Name])), Prams = {}, Examp = {},
					Infos = TLS.Fill(RQ.Doc || {}, { Methods: 'Unknown', Headers: {}, Examples: {} });

				// Setup Parameters
				switch (true) {
					case !!RQ.Doc.Params: 	Prams = RQ.Doc.Params; break;;
					case 	 !!RQ.Params: 	Prams = Imm	.OrderedMap(RQ.Params)
														.filter((doc, pr) => !!doc)
														.map((doc, pr) => {
															return Assign(doc.Desc||{}, {
																default: doc.Default
															});
														}); break;;
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
					[Name,Route], Imm.fromJS({
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

