export interface AuthInfo {
    identifier: string;
    loggedInAt: string;
    name?: string;
}
export interface RouteInfo {
    pickup?: string;
    destination?: string;
}
export declare function saveCookies(cookies: unknown[]): void;
export declare function loadCookies(): unknown[] | null;
export declare function saveAuth(info: AuthInfo): void;
export declare function loadAuth(): AuthInfo | null;
export declare function isLoggedIn(): boolean;
export declare function saveRoute(route: Partial<RouteInfo>): void;
export declare function loadRoute(): RouteInfo | null;
export declare function clearRoute(): void;
export declare function clearSession(): void;
//# sourceMappingURL=session.d.ts.map