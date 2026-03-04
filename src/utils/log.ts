/* eslint-disable no-console */
declare const __DEV__: boolean;

const PREFIX = "[Phonolite]";

export function debug(...args: unknown[]): void {
	// typeof guard prevents ReferenceError if esbuild didn't substitute __DEV__
	if (typeof __DEV__ !== "undefined" && __DEV__) console.log(PREFIX, ...args);
}

export function warn(...args: unknown[]): void {
	console.warn(PREFIX, ...args);
}
