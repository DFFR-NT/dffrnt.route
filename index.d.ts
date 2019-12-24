/// <reference types="node" />
/// <reference types="socket.io" />

/** @hidden */
import Immutable = require("immutable");
/**
 * The backend routing module for the `dffrnt.api` framework
 */

 /** @hidden */
import * as core from "express-serve-static-core";
/** @hidden */
import SocketIO from "socket.io";
/** @hidden */
import { 
	RouteGN, RouteAU, RouteDB, 
	QueryGN, QueryAU, QueryDB 
} from "dffrnt.confs";
/** @hidden */
import e from "express";
/** @hidden */
import { Server } from 'http';
/** @hidden */
import limiter from 'express-limiter';
/** @hidden */
import connRedis from 'connect-redis';
/** @hidden */
import { RedisClient } from "redis";

/**
 * Gloabl configuration `interfaces` for the `dffrnt.routes` module of the `dffrnt.api` framework.
 */
declare global {
	/** @hidden */ export const Imm = Immutable;
    /** @hidden */ export type  ExpressJS = core.Express;
    /** @hidden */ export type  ExRouter = core.Router;
    /** @hidden */ export type  ExRequest = core.Request;
    /** @hidden */ export type  ExResponse = core.Response;
	/** @hidden */ export type  ExNext = core.NextFunction;
	/** @hidden */ export type  sIO = typeof SocketIO;
	/** @hidden */ export type  RedisStore = ReturnType<typeof connRedis>;
	

	/** 
	 * Valid `request-methods` for use with `ExpressJS`.
	 */
	export type ExMethod  = 'get' | 'post' | 'put' | 'delete' | 'all';
	/**
	 * The kind of `request` configurator to use when adding a `Route`.
	 */
	export type TPReqKind = 'AURequest' | 'DBRequest';
	

	/**
	 * A `hanlder` for `ExpressJS` `requests` & `middleware`.
	 * @param req The client `request` object.
	 * @param res The client `response` object.
	 * @param next The next {@link CBExHandler|handler}; if there is one.
	 */
	export type CBExHandler = (req: ExRequest, res: ExResponse, next: ExNext) => void;
	/**
	 * Constructs the _full-path_ & `scheme` of a `Route`.
	 * @param name The `name` of the `Route`.
	 * @param act The `RouteGN` object configuring this `Route`.
	 * @param method The `method` this `Route` responds to.
	 * @param noScheme If `true`, only return the **full-path**; do not include the `scheme`.
	 */
	export type CBReqPattern = (name: string, act: RouteAU|RouteDB, method: HMETHOD, noScheme?: boolean) => string;
	/**
	 * A `function` that configures a `socket-session` with it's appropriate `handlers` and a `response` object.
	 * @param socket A client's `socket-session` object.
	 * @returns The `key` that triggers this `Socket` request.
	 */
	export type CBReqRocket = (socket: SocketIO.Socket) => string;


	/**
	 * The possible HTTP_MSG types that can be used.
	 */
	export type HTTP_ERRORS = 	'REQUEST' | 'HELP' | 'RESTORED' | 'ENDED' | 'EXPIRED' | 
								'LOADED' | 'UPDATED' | 'PROFILE' | 'ADDED' | 'VALID' | 
								'BAD_REQ' | 'ERROR' | 'INVALID' | 'TOKEN' | 'LOGIN' | 'EXISTS' |
								'NO_GET' | 'NO_POST' | 'NO_PUT' | 'NO_DELETE' | 'RATELIMIT';
	/**
	 * Defines a new `HTTP_MSG`
	 */
	export interface HTTP_OBJ {
		/**
		 * The HTTP **Status-Code** (\[1-5]\[0-9]\[0-9]).
		 */
		status: number;
		/**
		 * The template that serves as the message given to the end-user when this Status is triggered.
		 */
		temp: 	string;
		/**
		 *  
		 */
		help: 	boolean;
	};


	/**
	 * A plain-object representing the `schemes` of a `Route`, it's `subRoutes`, and it's `methods'` paths.
	 */
	export interface CLReqPatterns {
		[path: string]: { [method: HMETHOD]: string; };
	};
	/**
	 * A plain-object of `meta-data` to **save** within a client's `session`.
	 */
	export interface CLSessData { [metaName: string]: string; };

	/**
	 * An object consisting of a `template` and `matcher` for validating requests for a `Socket`.
	 */
	export interface TPSchemeChk {
		/**
		 * _See: {@link QueryGN.PathTemplate}_
		 */
		template: string;
		/**
		 * _See: {@link QueryGN.PathMatcher}_
		 */
		matcher: RegExp;
	};
	/**
	 * @hidden
	 */
	declare abstract interface TPRequest_ {
		/**
		 * The `method` that called this `request`.
		 */
		method: HMETHOD;
		/**
		 * The `url` that called this `request`.
		 */
		originalUrl: string;
		/**
		 * A plain-object of any `headers` within this request.
		 */
		headers?: { [headerName: string]: string };
		/**
		 * A plain-object of any `path-parameters` within this request.
		 */
		params?:  { [ paramName: string]: string };
		/**
		 * A plain-object of any `body` within this request.
		 */
		body?:    { [ paramName: string]: string };
		/**
		 * A plain-object of any `query` within this request.
		 */
		query?:   { [ paramName: string]: string };
		/**
		 * An `Array` any `files` within this request.
		 */
		files?:   string[];
	};
	/**
	 * A plain-object representation of a `request-object's` parameters.
	 */
	export interface TPRequest extends TPRequest_ {
		/** @hidden */ method: never;
	};
	/**
	 * A plain-object representation of a `FluxAction` request.
	 */
	export interface TPAction extends TPRequest_ {
		/** @hidden */ originalUrl: never;
	};


	export namespace RSTR {
		/**
		 * Hydrates body-params with the appropriate auth-path. These paths tell the client 
		 * whether to consider the user logged-in or to log them out by force.
		 * @param which `IN`, for valid sessions, `OUT` to force a client logout.
		 * @param body The current body-params.
		 * @param unlocked If `true`, does not hydrate..
		 */
		function STATE(which: 'IN'|'OUT', body: ROUT.JSN.Body, unlocked: boolean): ROUT.JSN.Body;
	};


	export namespace ROUT {
		namespace JSN {
			/**
			 * The `query`/`body` parameters of a `JSON` result's original request.
			 */
			export interface Query {
				[param: string]: string|number;
				/**
				 * The pagination page.
				 */
				page?:  number;
				/**
				 * The pagination limit.
				 */
				limit?: number;
			};
			/**
			 * The `metadata` of a request.
			 */
			export interface Body {
				/** 
				 * The `query` parameters.
				 */
				query?: JSN.Query;
				/** 
				 * The `body` parameters.
				 */
				body?: JSN.Query;
				/**
				 * A list of filenames for uploading.
				 */
				files?: string[];
			};
			/**
			 * The `path` parameters of a `JSON` result's original request.
			 */
			export interface Paths { 
				[param:string]: string|number; 
			};
			/**
			 * The `metadata` of a `JSON` result's original request.
			 */
			export interface Options {
				/** 
				 * The `path` parameters.
				 */
				params: JSN.Paths;
				/** 
				 * The `query` parameters.
				 */
				query?: JSN.Query;
				/** 
				 * The `body` parameters.
				 */
				body?: JSN.Query;
			};
			/**
			 * A collection of Related links for a `JSON` result object.
			 */
			export interface Links {
				[linkName: string]: string;
				/**
				 * A `link` to the **previous** results; if any.
				 */
				prev: string;
				/**
				 * A `link` to the **next** results; if any.
				 */
				next: string;
			};
			/**
			 * The payload object with a `JSON` results object
			 */
			export interface Payload {
				/**
				 * A `0` for success or an `Error` code.
				 */
				status:  number;
				/**
				 * The metadata of a `JSON` result's original request.
				 */
				options: JSN.Options;
				/**
				 * A collection of Related links for a `JSON` result object.
				 */
				links:   JSN.Links;
				/**
				 * The result of the client's `request`.
				 */
				result:  TPQryObject|TPQryObject[];
			};
			/**
			 * A `JSON` response returned by a client `request`.
			 */
			export interface Response {
				/**
				 * The [HTTP-Status](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) of the `request`.
				 */
				status: number;
				/**
				 * The result of said `request`.
				 */
				payload: JSN.Payload;
			};

		};

		export interface Client {
			/**
			 * The client ip-address.
			 */
			ip?: string;
			/**
			 * The client platform.
			 */
			platform: string;
			/**
			 * The client operating-system.
			 */
			os: string;
			/**
			 * The client device model.
			 */
			device: string;
			/**
			 * The client browser.
			 */
			browser: string;
		}

		export interface User {
			/**
			 * The user's account identifier. This could be a username, a userid, or email, etc.
			 */
			Account: string;
			/**
			 * A user's profile information. This object should contain information that 
			 * should always be on-hand.
			 */
			Profile: TPQryObject;
			/**
			 * A collection of key/values that represent the elements of a user-profile that 
			 * determine the scope said user is allowed to operate in.
			 */
			Scopes:  { [scopeName: string]: string; };
		};

		export interface Headers { [headerName: string]: string; };

	};


	export namespace SESS {
		/**
		 * Sends predefined, ssession-based `payloads` to a `socket`.
		 * @param sid The `sessionID`. If given, this message is sent to a specific socket within the `Accessor` space.
		 * @param strict If `true`; does not send anything (???).
		 * @param data An optional payload to send with the repsonse.
		 */
		type SendLoad = (sid: string, strict?: boolean, data?: TPQryObject) => void;

		/**
		 * The properties of an Alert Notification.
		 */
		interface AlertObj {
			/**
			 * The user's account-name, followed by an 8-length, arbitrary identifier for the notification. (`email@domain.com:We8s_3Sx`)
			 */
			id?: string;
			/**
			 * The type of notification this is. These types are defined by you.
			 */
			type: string;
			/**
			 * The content of the notification. This is a structure of your own design.
			 */
			payload: TPQryObject;
			/**
			 * The datetime this alert was posted.
			 */
			stamp: Date;
		};

		/**
		 * A collection of Group-Session actions.
		 */
		interface GroupActions {
			/**
			 * Retrieves a list of active sessionIDs for a user.
			 * @param uid The user's ID.
			 */
			Get(uid: string): Promise<string[]>;
			/**
			 * Adds a new sessionID to the list of active session for a user.
			 * @param uid The user's ID.
			 * @param id The sessionID to add.
			 * @returns `true`, if successful.
			 */
			Set(uid: string, id: string): Promise<boolean>;
			/**
			 * Removes a sessionID from the list of active session for a user.
			 * @param uid The user's ID.
			 * @param id The sessionID to add.
			 * @param invert If `true`, removes all sessions except for `id`.
			 * @returns `true`, if successful.
			 */
			Rem(uid: string, id: string, invert: boolean): Promise<boolean>;
			/**
			 * Retrieves a list of active session-info for a user.
			 * @param uid The user's ID.
			 */
			List(uid: string): Promise<ROUT.Client[]>;
		};
		/**
		 * A collection of Alert-Notification actions.
		 */
		interface AlertActions {
			/**
			 * Retrieves all alertIDs for a specified account-name.
			 * @param uid The user's ID.
			 */
			Keys(uid: string): Promise<string[]>;
			/**
			 * Checks if an alertID exists in the Alerts DB.
			 * @param uid The user's ID.
			 * @param id The alert ID.
			 */
			Exists(uid: string, id: string): boolean;
			/**
			 * Posts a Notification object to the Alerts DB.
			 * @param uids A single `User ID`; or An `Array` of `Yser IDs`.
			 * @param alert The alert object.
			 */
			async Post(uids: string[]|string, alert: AlertObj): Promise<boolean[]>;
			/**
			 * Grabs a Notification object from the Alerts DB.
			 * @param id The alert ID.
			 */
			Get(id: string): Promise<AlertObj>;
			/**
			 * Broadcasts a Notification to a user's active-sessions.
			 */
			Broadcast: SendLoad;
			/**
			 * Acknowledges a Notifcation has been handled and removes it from the Alerts DB.
			 * @param id The alertID to acknowledge.
			 * @returns `true`, if successful.
			 */
			Acknowledge(id: string): Promise<boolean>;
			/**
			 * Acknowledges a Notifcation has been handled and removes it from the Alerts DB.
			 * @param id An Array of alertIDs to acknowledge.
			 * @returns `true`, if successful.
			 */
			Acknowledge(id: string[]): Promise<boolean>;
			/**
			 * Retrieves a list of active session-info for a user.
			 * @param uid The user's ID.
			 */
			List(uid: string): Promise<AlertObj[]>;
		};

		/**
		 * The `REDIS` store collection.
		 */
		interface REDISCollection {
			[storeName: string]: RedisClient;
			Client:   RedisClient;
			Users:    RedisClient;
			Groups:   RedisClient;
			Limits:   RedisClient;
			Lockers:  RedisClient;
			Alerts:   RedisClient;
		};

		/**
		 * A collection of custom Plugins.
		 */
		interface Plugins {
			[pluginName: string]: object; 
		};

		interface App {
			/** 
			 * Sets the `MySQL` Connection object in the `REST API`.
			 * @param con A MySQL Connection.
			 */ 
			setSQLConn(con: MySQL.Connection): void;
			Group       : GroupActions;
			Alert       : AlertActions;
			Broadcast   : SendLoad;
			Regenerate  : SendLoad;
			Expired     : SendLoad;
			Logout      : SendLoad;
			Limiter     : typeof limiter;
			JWT			: typeof import('json-web-token');
			CL			: string[];
			Cookie 		: {
				Secret: string;
				Age: { 
					In: number, 
					Out: number; 
				};
			};
			Plugins		: Plugins;
			Stores 		: REDISCollection;
			LDAP 		: null;
			Auth 		: CFG.STTG.Auth;
			Passport	: typeof import('passport');
			Sender 		: import('events').EventEmitter;
			Accessor 	: SocketIO.Namespace;
			IO 			: SocketIO.Namespace;
		};

	};
};


/**
 * A routing module for the `dffrnt.api` framework.
 */
export module 'dffrnt.route' {
	/**
	 * ...
	 */
	declare module './lib/errors' {

		/** 
		 * An class used to define default response-payload HTTP Status-Codes.
		 */
		class HTTP_MSG {
			
			/** 
			 * The HTTP **Status-Code** (\[1-5]\[0-9]\[0-9]).
			 */
			readonly get status (): number;
			
			/** 
			 * The template that serves as the message given to the end-user when this Status is triggered.
			 */
			readonly get temp   (): string;
			
			/**
			 * If `true`, instructs the `Routes` namespace to include the API document in the payload 
			 * when the HTTP-Status is an Error-Code.
			 */
			readonly get help   (): boolean;

			/**
			 * Defines a new `HTTP_MSG`
			 * @param status The HTTP **Status-Code** (\[1-5]\[0-9]\[0-9]).
			 * @param temp A `sprintf`-style template that serves as the message given to the end-user when this 
			 * Status is triggered. The template can be as simple or complicated as you want, then you can hydrate 
			 * it with the appropriate values as needed.
			 * @param help If `true`, instructs the `Routes` namespace to include the API document in 
			 * the payload when the HTTP-Status is an Error-Code.
			 */
			constructor(status = 200, temp = '', help = false);

			/**
			 * A plain-object version of this `HTTP-MSG`
			 */
			valueOf(): HTTP_OBJ;
		};


		/**
		 * ...
		 */
		export const UER: {
			readonly message: 'unknown', 
			readonly stack: 'Error: unknown\n',
		};

		/**
		 * ...
		 */
		export const MSG: {
			readonly REQUEST: 	HTTP_MSG,
			readonly HELP: 		HTTP_MSG,
			readonly RESTORED: 	HTTP_MSG,
			readonly ENDED: 	HTTP_MSG,
			readonly EXPIRED: 	HTTP_MSG,
			readonly LOADED: 	HTTP_MSG,
			readonly UPDATED: 	HTTP_MSG,
			readonly PROFILE: 	HTTP_MSG,
			readonly ADDED: 	HTTP_MSG,
			readonly VALID: 	HTTP_MSG,
			readonly BAD_REQ: 	HTTP_MSG,
			readonly ERROR: 	HTTP_MSG,
			readonly INVALID: 	HTTP_MSG,
			readonly TOKEN: 	HTTP_MSG,
			readonly LOGIN: 	HTTP_MSG,
			readonly EXISTS: 	HTTP_MSG,
			readonly NO_GET: 	HTTP_MSG,
			readonly NO_POST: 	HTTP_MSG,
			readonly NO_PUT: 	HTTP_MSG,
			readonly NO_DELETE: HTTP_MSG,
			readonly RATELIMIT: HTTP_MSG,
		};

		/**
		 * ...
		 */
		export const PRM: {
			readonly GET: 	'query',
			readonly POST: 	'body',
			readonly PUT: 	'body',
			readonly DELETE: 'query',
		};

	};
	/**
	 * ...
	 */
	export const Errors: typeof import('./lib/errors');

	/**
	 * ...
	 */
	declare module './lib/help' {
		import { CNFDefaults } from 'dffrnt.confs';

		/**
		 * An JSON object for Error Messages.
		 */
		type ERHelp = { Error: string; };
		/**
		 * A reference to a Defined {@link GNParam}.
		 */
		type RFParam = GNParam | boolean | string[];
		/**
		 * Formats `path`/`header`/`query`/`body` definitions for `OpenAPI 3.0`.
		 * @param params A collection of `GNParam` instances, defining **Path**, **Headers**, **Query** or **Body** parameters.
		 * @param pathParams The path-parameters of the current `GNRoute`.
		 * @returns A OpenAPI 3.0 formatted object.
		 */
		type CBGetParams = (params: CLParameters, pathParams: string[] = []) => TPQryObject;

		/**
		 * Converts API configurations into a JSON Documentation
		 */
		class Helper {
			/**
			 * Creates an instance of Helper.
			 * @param config The `Helper` configs.
			 */
			constructor({ Kinds = [], Headers = {}, Params = {} }: CNFDefaults = {}): Helper;

			/**
			 * The JSON-formatted API Documentation.
			 */
			readonly get Document(): {};
			/**
			 * Access or Subscribe default `DocKindMaps`, `CLHeaders`, and `GNParams`
			 */
			get Defaults(): CNFDefaults;
			set Defaults(val: CNFDefaults): void;

			/**
			 * Formats an JSON object for Error Messages
			 * @param Property The erroring Property
			 * @param Name The erroring Object
			 * @returns The error message object
			 */
			Error	(Property: string, Name: string): ERHelp;
			/**
			 * Accesses a Help Document for responses
			 * @param Name The namespace the Route belongs to
			 * @param Route The name of the Route
			 */
			Get		(Name: string, Route: string): (DocRoute | ERHelp);
			/**
			 * Initializes the creation of a Route Documentation 
			 * @param Name The namespace the Route belongs to
			 */
			Create	(Name: string): void;
			/**
			 * Formats and subscribes a Route Documentation
			 * @param Name The namespace the Route belongs to
			 * @param Routes The parent-Routes of this Route
			 * @param Point The name of this Route
			 * @param Method The Method of the Route being documented
			 * @param RQ The Route to be documented
			 */
			Append	(Name: string, Routes: string[], Point: string, Method: HMETHODs, RQ: (RouteAU|RouteDB)): void;
			/**
			 * Finalizes the Documentation by adding the API-Doc route.
			 * @param Name The name of the documentation route.
			 */
			Finalize(Name: string = "apidoc"): void;
			
			/**
			 * Splits a path pattern to an `Array` of separate paths
			 * @param path The `RegexP` path to parse
			 */
			static GetSchemes(path: string): string[];
			/**
			 * Generates an `Array` of path-parameter `Arrays`, based on the provider schemes
			 * @param schemes An `Array` of path schemes
			 */
			static GetPathParams(schemes: string[]): Array<string[]>;
			/**
			 * Formats a Param-Reference Key based on the Specfied `name` & `ref`
			 * @param name The Name of the `Param`
			 * @param ref The `Param` Reference
			 * @returns A formatted Reference Key; or `false`, if invalid
			 */
			static MkeRefKey(name: string, ref: RFParam): (string | boolean);
			/**
			 * Checks if a `Reference-Key` matches any defined `Param-References`
			 * @param refKey The `Param-Reference` Key
			 * @param refs An option `Param-Reference` collection (_for speed_)
			 */
			static ChkRefKey(refKey: string, refs: Immutable.OrderedMap): boolean;
			/**
			 * Get an aliased `Reference-Key`
			 * @param refKey The `Param-Reference` Key
			 * @returns The real `Param-Reference` Key
			 */
			static GetRefAlias(refKey: string): string;
			/**
			 * Get a `Reference-Key`
			 * @param refKey The `Param-Reference` Key
			 * @param refs An option `Param-Reference` collection (_for speed_)
			 * @returns The real `Param-Reference` Key
			 */
			static GetRefKey(refKey: string, refs: Immutable.OrderedMap): string;
			/**
			 * Returns an appropriate `Object` of `in`-values, given the specified `method`.
			 * @param method A value specifiying a Request Method
			 */
			static GetInVals(method: HMETHODs): { [s: string]: string; };
			/**
			 * Generates an appropriate `Function` to designate parameters, given the specified `method`.
			 * @param method A value specifiying a Request Method
			 * @returns A param retrieval function
			 */
			static GetParamFactory(method: HMETHODs): CBGetParams;
		
		};

		export default Helper;
		
	};
	export const Help: import('./lib/help');

	/**
	 * ...
	 */
	declare module './lib/routes' {
		/**
		 * ...
		 */
		interface MAKER {
			/**
			 * Initializes all of the `Routes` within this application.
			 * @param api The initialized `ExpressJS` application.
			 * @param express The `ExpressJS` module.
			 * @param sess The initialized `session` module.
			 * @param setting The global application settings object.
			 */
			static Init(api: ExpressJS, express: import('express'), sess: SESS.App, setting: CFG.Settings): Promise<Routes>;
			/**
			 * Registers folders to be used for fileserving.
			 * @param R Any folders to add to the fileserve.
			 */
			private static FileRoutes(R: CFG.STTG.Folders): Routes;
			/**
			 * Registers specified **Authentication** `Routes` to the application.
			 * @param R The collection of `Route` configurations.
			 */
			private static AuthRoutes(R: CFG.PNTS.Routes<CFG.PNTS.Auth.Base>): Routes;
			/**
			 * Registers specified **Data** `Routes` to the application.
			 * @param R The collection of `Route` configurations.
			 */
			private static DataRoutes(R: CFG.PNTS.Routes<CFG.PNTS.Data.Base>): Routes;
			/**
			 * Registers specified **Help** `Routes` to the application.
			 */
			private static HelpRoutes(): Routes;
			/**
			 * Registers specified **Space** `Routes` to the application.
			 */
			private static async SiteRoutes(): Promise<Routes>;
		}

		export default MAKER;

	}
	/**
	 * ...
	 */
	export const Routes: typeof import('./lib/routes');

	/**
	 * Initializes & returns the session-specific class & modules.
	 * @param server The `HTTP-Server` object.
	 * @param app The initialized `ExpressJS` application.
	 * @returns The session namespace.
	 */
	export function Session(server: Server, app: ExpressJS): SESS.App;

	/**
	 * ...
	 */
	declare module "./lib/rest" {
		const Session: SESS.App;

		/**
		 * A REST API Interface for Endpoint Handling & Documentation.
		 */
		export class GNRequest { 
			public  readonly Name:     string;
			public  readonly Requests: Immutable.OrderedMap<string,(RouteAU|RouteDB)>;
			private readonly _start:   Immutable.OrderedMap<string,Date>;

			/**
			 * Creates an instance of GNRequest.
			 * @param Name The name of the request route
			 * @param Configs The configurations for the request route 
			 */
			constructor(Name: string, Configs: (CLRouteAU | CLRouteDB)): GNRequest;

			/**
			 * Sends an `Error` response to the Client
			 *
			 * @param req The Client `HTTP` `Request` instance
			 * @param res The Server `HTTP` `Response` instance
			 * @param err The `Error` instance
			 */
			Error(req: ExRequest, res: ExResponse, err: Error): void;
			/**
			 * Sends an `Limit` response to the Client when a 
			 * limit-rate has been reached
			 *
			 * @param req The Client `HTTP` `Request` instance
			 * @param res The Server `HTTP` `Response` instance
			 */
			Limit(req: ExRequest, res: ExResponse): void;

			/**
			 * Renders a message specific to a `User` account via a provided template.
			 *
			 * @param msg A `sprintf`-style string template.
			 * @param acct A username, email, etc.
			 * @returns A formatted message directed to a specific `User`.
			 */
			MS(msg: string, acct: string): string
			/**
			 * Sends a User-Info Server Response to a Client (`HTTP` or `Socket`).
			 *
			 * @param res An `HTTP` or `Socket` instance.
			 * @param msg A message regarding the response.
			 * @param usr The user-info object.
			 * @param acct A username, email, etc.
			 * @param bdy The `body` object from the request.
			 * @param cde The payload status code (_this is **NOT** the `HTTP` status_).
			 * @param next The `next` step in the process.
			 */
			OK(res: ExResponse, msg: string, usr: ROUT.User, acct: string, bdy: ROUT.JSN.Query, cde: number, next: ExNext): void;
			/**
			 * Sends a Server Response to a Client (`HTTP` or `Socket`)
			 *
			 * @param res An `HTTP` or `Socket` instance
			 * @param pay The "payload" object to send to the Client
			 * @param opts The "options" object, which includes the `params`, `query`, `body`, etc.
			 * @param status The `HTTP` status code
			 */
			SN(res: exResponse, pay: ROUT.JSN.Payload, opts: ROUT.JSN.Options, status: number): void;
			/**
			 * Sends an Error Response to a Client (`HTTP` or `Socket`).
			 *
			 * @param res An `HTTP` or `Socket` instance.
			 * @param hnd The appropriate Error Response handler.
			 * @param err The `Error` instance.
			 * @param acct A username, email, etc.
			 * @param qry The `query` object from the request.
			 * @param all If `true`, send to all subscribers.
			 * @param noSend If `true`, do **NOT** send, just return the result.
			 * @returns If `noSend` is `true`, this result object is returned.
			 */
			ER(res: ExResponse, hnd: Errors.HTTP_MSG, err: Error, acct: string, qry: ROUT.JSN.Options, all: boolean = false, noSend: boolean = false): (ROUT.JSN.Payload|void);

			/**
			 * Generates a random, unique `HASH` for identifying each `Timer`
			 *
			 * @returns A random, unique `HASH` identifier
			 * @see {@link TimerStart}
			 * @see {@link TimerEnd}
			 */
			TimerHash(    ): string;
			/**
			 * Starts a Timer until explicity ended with `TimerEnd()`
			 *
			 * @returns A generated `HASH` identifier
			 * @see {@link TimerHash}
			 * @see {@link TimerEnd}
			 */
			TimerStart(    ): string;
			/**
			 * Ends the Timer and returns the duration
			 *
			 * @param hash A `HASH` identifier (_gererated by `TimerHash()`_)
			 * @returns The duration of the timed execution
			 * @see {@link TimerHash}
			 * @see {@link TimerStart}
			 */
			TimerEnd(hash: string): number;
		};

		/**
		 * A REST API Object for Authentication Endpoint Handling & Documentation.
		 */
		export class AURequest extends GNRequest { 
			[routeName: string]: { 
				[method: string]: (...args) => Promise<QYAuthResult>; 
			};

			public  readonly Requests: Immutable.OrderedMap<string,RouteAU>;

			/**
			 * Creates an instance of AURequest.
			 * @param Name The name of the request route
			 * @param Configs The configurations for the request route 
			 */
			constructor(Name: string, Configs: CLRouteAU): AURequest;

			get Passer  (): typeof Session.Passport;
			get Token  	(): typeof Session.JWT;
			get Cookie  (): typeof Session.Cookie;
			get LDAP  	(): typeof Session.LDAP;
			get Stores  (): typeof Session.Stores;
			get Client  (): typeof Session.Stores.Client;
			get Users  	(): typeof Session.Stores.Users;
			get Script  (): typeof Session.Auth.SQL;

			/**
			 * Decrypts a `Basic-Authentication` string and passes the results to a request for further processes.
			 * @param req The client request-object.
			 * @param userField The name of the `username` field.
			 * @param passField The name of the `passowrd` field.
			 */
			Decrypt(req: ExRequest, userField: string, passField: string): void;
			/**
			 * Defines the scopes of an `LDAP` user account.
			 * @param user The user object.
			 * @returns The scope tree.
			 */
			Scopes(user: TPQryObject): { [grandparent: string]: { [parent: string]: { [child: string]: {}; }; }; };
			/**
			 * Retrieves and adds an `LDAP` user's photo.
			 * @param user The user object.
			 */
			Photo(user: TPQryObject): ({ Photo: string; } | {});
			/**
			 * Parses an `LDAP` user's manager.
			 * @param manager The user's manager property.
			 * @returns}
			 */
			Boss(manager: string): { name: string; link: string; };
			/**
			 * Formats a user-object into a `ROUT.User`-formatted object.
			 * @param row The user-object.
			 */
			Format(row: TPQryObject): ROUT.User;
			/**
			 * Parse a `JSON` string into an object.
			 * @param user The user object.
			 */
			Parse(user: TPQryObject): TPQryObject;
			/**
			 * Determines if a user's `session-scope/properties` have changed.
			 * @param older The currently-stored session's user object.
			 * @param newer The current user object.
			 */
			Change(older: TPQryObject, newer: TPQryObject): boolean;
			
			/**
			 * Decrypts a user-session token into a user-object.
			 * @param token The user-session token.
			 */
			DeToken(token: string): Promise<TPQryObject>;
			/**
			 * Encrypts a user-object token into a user-session.
			 * @param user The user-object
			 */
			Tokenize(user: TPQryObject): Promise<string>;
			/**
			 * Finalizes a user's authentication by logging the user into a tracking database.
			 * @param user The user-object.
			 * @param withToken If `true`; add the `token` to the user-object.
			 * @returns The user token.
			 */
			async Grant(user: TPQryObject, withToken: string): string | Error;
			/**
			 * Retrieves a user-object after successful login.
			 * @param acct The user account identifier.
			 * @param withToken If `true`; add the `token` to the user-object.
			 * @returns The user token.
			 */
			async Profile(acct: string, withToken: boolean): string | Error;
			
			/**
			 * Processes the steps in a authentication series.
			 * @param config The authenticator-procress.
			 */
			Session(config: CLProcs): Promise<QYAuthResult>;
			
			/**
			 * Initializes all Auth-Endpoints
			 */
			Init(): AURequest;

		};
		/**
		 * A REST API Object for Database Endpoint Handling & Documentation.
		 */
		export class DBRequest extends GNRequest { 
			[routeName: string]: { 
				[method: string]: (req: ExRequest) => Promise<QYDataResult>; 
			};

			public  readonly Requests: Immutable.OrderedMap<string,RouteDB>;
			private readonly Sanitzers: CLSanitizers; 
			private readonly Defaults:  { [defaultName: string]: any; };

			/**
			 * Creates an instance of DBRequest.
			 * @param Name The name of the request route
			 * @param Configs The configurations for the request route 
			 */
			constructor(Name: string, Configs: CLRouteDB): DBRequest;
		
			/**
			 * Sanitizes & Formats each Parameter in an Endpoint's clause
			 * @param name The name of this Endpoint
			 * @param method The method of this Endpoint
			 * @param cls An `object literal` of parameter clauses
			 * @param gnp An `object literal` of `GNParam` instances for each parameter
			 */
			Clause  (name: string, method: HMETHOD, cls: { [paramName: string]: string; }, gnp: CLParameters);
			/**
			 * Parses a request result for consumption by the client.
			 * @param RQ A request-method handler.
			 * @param RT The result of the request.
			 * @param QY The `query`/`body` of the request.
			 */
			Parse  	(RQ: CFG.PNTS.Data.Method, RT: (TPQryObject | TPQryObject[]), QY: ROUT.JSN.Query): (TPQryObject | TPQryObject[]);
			/**
			 * Builds a full-path of endpoint paths in relation to this request.
			 * @param args The strings to use in the path.
			 */
			Path  	(...args: string[]): string
			/**
			 * Builds a `SQL` casting function to convert row values to determined types for a request method handler.
			 * @param RQ A request-method handler.
			 */
			Cast  	(RQ: CFG.PNTS.Data.Method): MySQL.TypeCast
			/**
			 * Takes a request `query`/`body` and converts any `;`-separated lists into `Arrays`.
			 * @param cls The request clause.
			 */
			Opts  	(cls: { [paramName: string]: string; }): { [paramName: string]: string | string[]; }

			/**
			 * Initializes all Data-Endpoints
			 */
			Init  (): DBRequest
		};


		/**
		 * A Request Object for Remote **REST APIs** using the `dffrnt`.`api` Framework.
		 */
		export class Remote { 
			/**
			 * Creates an instance of Remote.
			 * @param services The Socket URL for the remote API 
			 */
			constructor(services: string[] = []): Remote;

			/**
			 * The collection of allowed HTTP `methods`
			 */
			readonly get Methods	( ): ['GET','PUT','POST','DELETE','MIDDLEWARE'];
			/**
			 * A mapping of `prop` names to their respective HTTP `method`
			 */
			readonly get Which  	( ): {
				GET: 'query', 
				PUT: 'body', 
				POST: 'body',
				DELETE: 'body', 
				MIDDLEWARE: 'body'
			};
			
			/**
			 * A mixin for default `body`/`query` options.
			 *
			 * @param rid The Request ID.
			 * @param point The endpoint for the request.
			 * @param method The method for the request.
			 * @param props The request `params`.
			 * @returns A mixed-in `ROUT.JSN.Body` object to pass to the request.
			 */
			private _defaults(rid: string, point: string = '', method: HMETHOD = 'GET', props: ROUT.JSN.Body = {}): ROUT.JSN.Body
			/**
			 * Remove the listen of the last completed Request.
			 *
			 * @param rid The Request ID.
			 * @param callback The callback that handled the last Request.
			 */
			private _clean(rid: string, callback: CBRemote): void;
			/**
			 * Checks if the `HMETHOD` is valid.
			 *
			 * @param method The method for the request.
			 */
			private _valid(method: HMETHOD = 'GET'): boolean;
			/**
			 * Executes all `Remote` DB reuests.
			 *
			 * @param point The endpoint for the request.
			 * @param method The method for the request.
			 * @param params The request `params`.
			 * @param props  The `body`, `files`, and/or `query` options of the request.
			 */
			private async _requests(point: string = '', method: HMETHOD = 'GET', params: ROUT.JSN.Paths = {}, props: ROUT.JSN.Body = {}, misc = {}): Promise<ROUT.JSN.Response>;
			
			/**
			 * Performs a Remote `MIDDLEWARE` Request.
			 *
			 * @param point The endpoint for the request.
			 * @param params The request `params`.
			 * @param query  The `query` options of the request.
			 * @param misc  Any miscellaneous options for the request.
			 */
			MID (point: string = '', params: ROUT.JSN.Paths = {}, body = {}, misc: {} = {}): Promise<ROUT.JSN.Response>;
			/**
			 * Performs a Remote `GET` Request
			 *
			 * @param point The endpoint for the request
			 * @param params The request `params`
			 * @param query  The `query` options of the request
			 * @param misc  Any miscellaneous options for the request
			 */
			GET (point: string = '', params: ROUT.JSN.Paths = {}, query: ROUT.JSN.Body = {}, misc: {} = {}): Promise<ROUT.JSN.Response>;
			/**
			 * Performs a Remote `PUT` Request
			 *
			 * @param point The endpoint for the request
			 * @param params The request `params`
			 * @param body   The `body` of the request
			 * @param files  A possible list of `File` objects
			 * @param misc  Any miscellaneous options for the request
			 */
			PUT (point: string = '', params: ROUT.JSN.Paths = {}, body: ROUT.JSN.Body  = {}, files: ReqFiles = [], misc: {} = {}): Promise<ROUT.JSN.Response>;
			/**
			 * Performs a Remote `POST` Request
			 *
			 * @param point The endpoint for the request
			 * @param params The request `params`
			 * @param body   The `body` of the request
			 * @param misc  Any miscellaneous options for the request
			 */
			POST(point: string = '', params: ROUT.JSN.Paths = {}, body: ROUT.JSN.Body  = {}, misc: {} = {}): Promise<ROUT.JSN.Response>;
			/**
			 * Performs a Remote `DELETE` Request
			 *
			 * @param point The endpoint for the request
			 * @param params The request `params`
			 * @param misc  Any miscellaneous options for the request
			 */
			DEL (point: string = '', params: ROUT.JSN.Paths = {}, misc: {} = {}): Promise<ROUT.JSN.Response>;
			
			/**
			 * Gets a new Callback ID
			 * @returns A new Callback ID
			 */
			static newID(): string;
			
			/**
			 * Saves a _new_ client `session`.
			 * @param req The client `request` object.
			 * @param data A plain-object of `meta-data` to **save** with the `session`.
			 */
			static Save 		(req: ExRequest, data: CLSessData = {}): void;
			/**
			 * Renews a client's _near-expired_ `session`.
			 * @param req The client `request` object.
			 * @param data A plain-object of `meta-data` to **save** with the `session`.
			 */
			static Renew  	  	(req: ExRequest, data: CLSessData = {}): void;
			/**
			 * Regenerates a client's _current_ `session`.
			 * @param req The client `request` object.
			 */
			static Regenerate 	(req: ExRequest): Promise<QYAuthResult>;
			/**
			 * Destroys a client's `session`.
			 * @param req The client `request` object.
			 */
			static Destroy 		(req: ExRequest): void;
			/**
			 * Removes _senstive-data_ from a client's `session`.
			 * @param req A client `request` object to sanitize.
			 */
			static Santitize 	(req: ExRequest): void;

		};

		
		/**
		 * The REST API Object Factory.
		 */
		class RESTFactory { 
			/**
			 * Auth/Endpoint Configs.
			 */
			readonly get Config (): {
				AuthP: CFG.AuthPoints;
				EndP: CFG.DataPoints;
			}; 
			/**
			 * Auth/Endpoint Handlers.
			 */
			readonly get Points (): { 
				[baseName: string]: (AURequest|DBRequest);
			}; 
			/**
			 * Auth/Endpoint Documentation.
			 */
			readonly get Help   (): typeof Help; 
			/**
			 * Auth/Endpoint Remote-Caller.
			 */
			readonly get Remote (): Remote; 


			/**
			 * Registers instances of `GNRequest`
			 *
			 * @param name The name of the request route
			 * @param configs The configurations for the request route 
			 */
			GNRequest(name: string, configs: CFG.PNTS.Base): void;
			/**
			 * Registers instances of `AURequest`
			 *
			 * @param name The name of the request route
			 * @param configs The configurations for the request route 
			 */
			AURequest(name: string, configs: CFG.PNTS.Auth.Base): void;
			/**
			 * Registers instances of `DBRequest`
			 *
			 * @param name The name of the request route
			 * @param configs The configurations for the request route 
			 */
			DBRequest(name: string, configs: CFG.PNTS.Data.Base): void;
			/**
			 * Reflects the API-Doc route in the API-Documentation.
			 * @param name The name of the documentation route.
			 */
			HPRequest(name: string): void;
			/**
			 * Registers the instance of the `Remote` for global use
			 *
			 */
			RMRequest(): void;

			/**
			 * Initializes the `API Server`, `API Client`, or both
			 *
			 * @param session A `dffrnt`.`route`.`Session` instance
			 */
			Init(session: SESS.App): void;

			/**
			 * ...
			 */
			Start(): void;

		};

		export default RESTFactory();
	}
	/**
	 * ...
	 */
	export const REST: typeof import('./lib/rest');

}
