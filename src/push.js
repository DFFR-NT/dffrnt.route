'use strict';

/////////////////////////////////////////////////////////////////////////////////////
// REQUIRES

	const fs        = require('fs');
	const zlib      = require('zlib');
	const stream	= require('stream');
	const PassThru  = stream.PassThrough;
	const Duplex 	= stream.Duplex;

/////////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS

	const GSTRM 	= async (file) => {
		return new Promise((resolve, reject) => { try {
			// --------------------------------------------------------------------
			let FLE  =  `.${file.path}`,
				FDS  =  fs.openSync(FLE,"r"),
				STT  =  fs.fstatSync(FDS),
				MIM  =  mime.lookup(file.path),
				NaJ  =  MIM!='application/javascript', 
				NaI  =  file.enc!='Base64',
				GZP  = 	{true:{'Content-Encoding':'gzip'},false:{}},
				PIP  =	{true:()=>zlib.createGzip(),false:()=>new PassThru()},
				LEN  =  0, CHK = [],
				GLN  =  ()=>(LEN=CHK.reduce((p,c)=>(p+c.length), 0),LEN),
				ZoN  =  (b)=>(!NaJ?zlib.gzipSync(b):b),
				HDR  =  (size) => ({
							'Last-Modified'  : STT.mtime.toUTCString(),
							'Content-Length' : size,
							'Cache-Control'  : `public, max-age=${Publics.Age}`,
							'Content-Type'   : MIM,
							...(GZP[NaI]),
						});
			// --------------------------------------------------------------------
			fs	.createReadStream(FLE)
				.pipe(PIP[NaI&&NaJ]())
				.on('data', chunk=>CHK.push(chunk))
				.on('error', err=>reject(err))
				.on('end', ()=>(resolve({
					...file,
					headers:  HDR(GLN()),
					content:  ZoN(Buffer.concat(CHK, LEN)),
					gzip:     NaI,
				})));
		} catch (e) { reject(e); }; });
	};
	const PMap 		= async (file) => {
		try {
			let res = await GSTRM.bind(this)(file);
			// console.log(res);
			return res;
		} catch (err) {
			throw err;
		}
	};

/////////////////////////////////////////////////////////////////////////////////////
// EXPORTS

	module.exports = (async () => {
		const PUSH = await Promise.all(FILES.map(PMap));

		return (req, res) => {
			return PUSH.map(async (file) => {
				new Promise((resolve, reject) => { try {
					let STRM = new Duplex();
					STRM.push(file.content);
					STRM.push(null);
					STRM.pipe(res.push(file.path, {
						status:   200, 
						method:   'GET', 
						request:  { accept: '*/*' },
						response: file.headers
					}).on('error', (err) => {
						reject(err);
						LG.Error( req.sessionID, 'HTTPPUSH', `${err} >> ${file.path}`); 
					}).on('end',   () => {
						resolve(true);
						LG.Server(req.sessionID, 'HTTPPUSH', file.path, 'magenta'); 
					})	);
				} catch (e) {
					console.log(e);
					throw e;
				}; 	});
			});
		};
	})();

/////////////////////////////////////////////////////////////////////////////////////
