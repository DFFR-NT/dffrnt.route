
'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const { Assign, Imm, TLS } = require('dffrnt.utils'),
			Defs = Imm.fromJS({
				Kinds: 	 { GET: ['GET'], POST: ['POST'], BOTH: ['GET', 'POST'], MID: ['MIDDLEWARE'] },
				Headers: { Token: { type: "Text", description: "The secret Token Key given upon Sign-Up", required: true  }, },
				Params:  {
					Single: { 	Default: 'false', Format  (cls) { return cls.single; },
						Desc: {
							type: 'boolean',
							description: 'Return a {{single}} {{User}} only',
							required: false, to: 'query', hidden: false
						}
					},
					Visible: { 	Default:  true, Format  (cls) { return cls.visible; },
						Desc: { 
							type: 'boolean', 
							description: 'Toggle {{Visibility}} layer',
							required: false, to: 'query', hidden: false
						}
					},
					Page:  { 	Default: 1, Format(cls) { return cls.page; },
						Desc: { 
							type: { Number: { min:  1 } }, 
							description: "The page number of the given results",
							required: false, to: 'query', hidden: false
						}
					},
					Limit: { 	Default: 10, Format(cls) { return cls.limit; },
						Desc: { 
							type: { Number: { min: -1 } }, 
							description: "The amount of items displayed per page",
							required: false, to: 'query', hidden: false
						}
					},
					ID: { 	Default: '', Format(cls) { return cls.element; },
						Desc: { 
							type: 'Object', 
							description: "A unique ID that is return with the result. This can be used for tracking purposes",
							required: false, to: 'query', hidden: true 
						}
					}
				},
			}),
			Document = {};

/////////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS

	function Error	(Property, Name) { return { Error: "Sorry, there's no "+Property+" Documentation for ["+Name+"], yet." }; }

	function Get	(Name, Route) {
		let RGX = new RegExp(`^${(Route||'').replace(/^\/help|\/$/,'')}$`),
			Doc = Document[Name], Res = Doc, Done = 0;
		// Match the Route to a specific Doc; if applicable
		if (!!Doc && !!Route) Object.keys(Doc).map((k,i) => {
			!Done && !!k.match(RGX) && (Res = Doc[k], Done = 1)
		});
		// Return specific Doc or general Doc
		return Res || Error('Help', Name);
	}

	function Create	(Name) { !Document.hasOwnProperty(Name) && (Document[Name] = {}); }

	function Append	(Name, RQ) {
		var Route = TLS.Path([Name].concat(RQ.Routes || [], [RQ.Name])), Prams = {}, Examp = {},
			Infos = TLS.Fill(RQ.Doc || {}, { Methods: 'Unknown', Headers: {}, Examples: {} });

		// Setup Parameters
		switch (true) {
			case !!RQ.Doc.Params: Prams = RQ.Doc.Params; break;;
			case !!RQ.Params: 	Imm.OrderedMap(RQ.Params).map((doc, pr) => {
									// var doc = RQ.Params[pr];
									if (!!doc) Prams[pr] = Assign(doc.Desc||{}, {
										default: doc.Default
									});
								}).toObject(); break;;
			default: Prams = Error('Parameter', RQ.Name)
		}

		// Setup Examples
		switch (true) {
			case !!RQ.Doc.Examples:
				Object.keys(Infos.Examples || {}).map((ex, e) => {
					var link =  TLS .Path([Route, ex]).replace(/\s/g, '%20');
					Examp[link] = Infos.Examples[ex];
				}); break;;
			default: Examp = Error('Examples in this', RQ.Name)
		}

		// Append
		Document[Name][Route] = {
			method: 	Infos.Methods,
			headers: 	Infos.Headers,
			params: 	Prams,
			examples: 	Examp,
		};
	}

/////////////////////////////////////////////////////////////////////////////////////
// EXPORT

	module.exports = config => { return {
		Defaults: 	Defs.mergeDeep(Imm.fromJS(config || {})).toJS(),
		Get, Create, Append, Document
	};	};

