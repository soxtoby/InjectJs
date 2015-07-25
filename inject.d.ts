declare module Inject {
    export interface resolve {
        /** Resolves a value for the given dependency. */
        (key: Dependency): any;


        /** Resolves the injected factory function for a dependency */
        injected(key: Dependency): Function;

        /** Disposes the container and everything that has been resolved from it. */
        dispose(): void;

        /** Returns a function with its dependencies resolved. */
        function(fn: Function): Function;

        /** 
         * Returns a function with its dependencies resolved.
         * Dependencies will be resolved from local pairings first.
         */
        function(fn: Function, localKeys: any[], localValues: any[]): Function;

        /** Resolves the default factory function for a key */
        defaultFactory(key: Dependency): Function;
    }

    export interface Registration {
        /** The keys associated with this Registration. */
        keys(): any[];

        /** Associates this Registration with a type. */
        forType(type: Function): Registration;

        /** Associates this Registration with multiple types. */
        forTypes(types: Function[]): Registration;

        /** Associates this Registration with a string key. */
        forKey(key: string): Registration;

        /** Associates this Registration with multiple string keys. */
        forKey(keys: string[]): Registration;

        /** Registers a constructor function. */
        create(type: Function): Registration;

        /** Registers a value. */
        use(value: any): Registration;

        /** Registers a factory function. */
        call(fn: Function): Registration;

        /** Registers a function whose dependencies will be resolved. */
        resolveFunction(fn: Function): Registration;

        /** The Registration is resolved only once, from the container it was injected into. */
        once(): Registration;

        /** The Registration is resolved up to once per container. */
        perContainer(): Registration;

        /** The Registration is resolved every time it is requested. */
        perDependency(): Registration;

        /** Calls a function with the resolved value after the Registration is resolved. */
        then(callback: (value: any) => void): Registration;

        /** Intercepts the resolution of each argument to the registered constructor, factory or function. */
        useParameterHook(hook: (resolve: resolve, key: string) => any): Registration;

        /** Provides a value for a dependency of the registered constructor, factory or function. */
        withDependency(key: any, value: any): Registration;

        /** Provides arguments, in order, to the registered constructor, factory or function. */
        withArguments(...args: any[]): Registration;
    }

    /** A dependency identifier that can be resolved. */
    export interface Dependency { }
}

declare var inject: {
    /** Creates a new container, optionally as a child of another container. */
    (registrations: Inject.Registration[], parentResolve?: Inject.resolve): Inject.resolve;

    /** Key for resolving the current resolve function. */
    resolve: Inject.Dependency;

    /**
     * Annotates function with provided dependencies.
     * @throws if any dependencies are undefined
     */
    dependant<T extends Function>(dependencies: Inject.Dependency[], fn: T): T;

    /**
     * Annotates function as an injectable function with provided dependencies.
     * @throws
     * if there are more dependencies than function parameters,
     * or if any dependencies are undefined.
     */
    dependantFn<T extends Function>(dependencies: Inject.Dependency[], fn: T): T;

    /** 
     * Annotates function with provided dependencies.
     * @throws
     * if number of dependencies doesn't match number of function parameters,
     * or if any dependencies are undefined.
     */
    ctor<T extends Function>(dependencies: Inject.Dependency[], fn: T): T;

    /** Creates a fallback resolve function to be used as the parent of a container */
    fallback(fallbackFn: (key: any) => any, parentResolve?: Inject.resolve): any;

    /** Creates a registration for a type. */
    forType(type: Function): Inject.Registration;

    /** Creates a registration for multiple types. */
    forTypes(types: Function[]): Inject.Registration;
    
    /** Creates a registration that instantiates a constructor function. */
    type(type: Function): Inject.Registration;

    /** Creates a registration for a key. */
    forKey(key: string): Inject.Registration;

    /** Creates a registration for multiple keys. */
    forKeys(keys: string[]): Inject.Registration;

    /** Creates a registration that constructs a type only once. */
    single(type: Function): Inject.Registration;

    /** 
     * Creates a registration that calls the given factory.
     * The factory's dependencies will be automatically resolved.
     */
    factory(fn: Function): Inject.Registration;

    /** Creates a registration that returns a value. */
    value(value: any): Inject.Registration;

    /** Creates a registration that returns a function with its dependencies resolved. */
    function(fn: Function): Inject.Registration;

    /** Creates a dependency on a function that, called with the given parameters, will resolve the given key. */
    func(key: any, funcDependencies: Inject.Dependency[]): Inject.Dependency;

    /** Creates a dependency that provides a default value if it can't be resolved. */
    optional(key: any, defaultValue: any): Inject.Dependency;

    /** Creates a dependency on a type that is resolved using the given key. */
    named(type: Function, key: string): Inject.Dependency;

    /** Creates a dependency on everything registered for a key. */
    all(key): Inject.Dependency;
};