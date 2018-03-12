
var Defs = Imm.fromJS({
		Kinds: 	 { GET: ['GET'], POST: ['POST'], BOTH: ['GET', 'POST'], MID: ['MIDDLEWARE'] },
		Headers: { Token: { type: "Text", description: "The secret Token Key given upon Sign-Up", required: true  }, },
		Params:  {
			Page:  { 	Default: 1, Format: function (cls) { return cls.page; },
				Desc: {
					type: { Number: { min:  1 } }, description: "The page number of the given results",
					required: false, to: 'query', hidden: false
				}
			},
			Limit: { 	Default: 10, Format: function (cls) { return cls.limit },
				Desc: {
					type: { Number: { min: -1 } }, description: "The amount of items displayed per page",
					required: false, to: 'query', hidden: false
				}
			},
			ID: { 	Default: '', Format: function (cls) { return cls.element; },
				Desc: { type: 'Object', description: "A unique ID that is return with the result. This can be used for tracking purposes",
				required: false, to: 'query', hidden: true }
			}
		},
	}),
	Document = {};

function Error (Property, Name) { return { Error: "Sorry, there's no "+Property+" Documentation for ["+Name+"], yet." }; }

function Get (Name, Route) { return Document[Name][Route] || Document[Name] || Error('Help', Name); }

function Create (Name) { if (!Document.hasOwnProperty(Name)) Document[Name] = {}; }

function Append (Name, RQ) {
	var Route = TLS.Path([Name].concat(RQ.Routes || [], [RQ.Name])), Prams = {}, Examp = {},
		Infos = TLS.Fill(RQ.Doc || {}, { Methods: 'Unknown', Headers: {}, Examples: {} });

	// Setup Parameters
	switch (true) {
		case !!RQ.Doc.Params: Prams = RQ.Doc.Params; break;;
		case !!RQ.Params: 	Object.keys(RQ.Params).map(function (pr, p) {
								var doc = RQ.Params[pr];
								if (!!doc) {
									Prams[pr] = Assign(doc.Desc || {}, {
										default: doc.Default
									});
								}
							}); break;;
		default: Prams = Error('Parameter', RQ.Name)
	}
	// Setup Examples
	switch (true) {
		case !!RQ.Doc.Examples:
			Object.keys(Infos.Examples || {}).map( function (ex, e) {
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


// Export
module.exports = function (config) {
	return {
		Defaults: 	Defs.mergeDeep(Imm.fromJS(config || {})).toJS(),
		Get: 		Get,
		Create: 	Create,
		Append: 	Append,
		Document: 	Document,
	};
}

