(function () {
    function resolveValue(resolve, key) {
        return resolveFunction(resolve, defaultFactory(resolve, key));
    }

    function resolveFunction(resolve, fn, localKeys, localValues) {
        return fn.apply(this, resolveDependencies(resolve, dependencyKeys(fn), localKeys || [], localValues || []));
    }

    function func(key, funcDependencies) {
        // TODO should be perDependency
        return new Registration(ctor([resolveFn], function (resolve) {
            return function() {
                return resolve.function(defaultFactory(resolve, key), funcDependencies, makeArray(arguments));
            };
        }));
    }

    function construct(fn) {
        return new Registration(constructor(fn));
    }

    function constructor(fn) {
        return ctor(dependencyKeys(fn), function constructorFn() {
            return new (Function.prototype.bind.apply(fn, [null].concat(makeArray(arguments))));
        });
    }

    function optional(key, defaultValue) {
        return new Registration(ctor([resolveFn], function (resolve) {
            var defaultValueFactory = constant(defaultArg(defaultValue, null));
            return resolve.function(
                resolve.injected(key, constant(defaultValueFactory)));
        }));
    }

    function defaultFactory(resolve, key) {
        if (key instanceof Registration)
            return key.build();
        var injectedFn = resolve.injected(key);
        if (injectedFn)
            return injectedFn;
        if (typeof key == 'function')
            return constructor(key);
        throw new Error('Failed to resolve ' + name(key));
    }

    function resolveDependencies(resolve, required, localKeys, localValues) {
        if (!required.length)
            return [];

        var localIndex = localKeys.indexOf(required[0]);
        return localIndex >= 0
            ? [localValues[0]].concat(resolveDependencies(resolve, required.slice(1), slicei(localKeys, localIndex), slicei(localValues, localIndex)))
            : [resolve(required[0])].concat(resolveDependencies(resolve, required.slice(1), localKeys, localValues));
    }

    function slicei(array, index) {
        return array.filter(function (_, i) {
            return i != index
        });
    }

    function dependencyKeys(ctor) {
        return ctor.dependencies || [];
    }

    function verifyType(key, value) {
        if (notDefined(value))
            throw new Error(name(key) + " resolved to undefined.");
        return value;
    }

    function name(key) {
        return key.name
            || ('' + key);
    }

    function pcall(fn) {
        return papply(fn, makeArray(arguments, 1));
    }

    function papply(fn, args) {
        return function partial() {
            return fn.apply(this, args.concat(makeArray(arguments)));
        };
    }

    function newScope() {
        var keys = [],
            values = [],
            get = lookup(keys, values);

        return function scope(key, resolveForKey) {
            return get(key, function() {
                var value = resolveForKey();
                keys.push(key);
                values.push(value);
                return value;
            });
        };
    }

    function lookup(keys, values) {
        return function get(key, fallback) {
            var i = keys.indexOf(key);
            return i >= 0
                ? values[i]
                : (fallback || constant())();
        };
    }

    function defaultArg(arg, defaultValue) {
        return notDefined(arg)
            ? defaultValue
            : arg;
    }

    function notDefined(value) {
        return !isDefined(value)
    }

    function isDefined(value) {
        return typeof value != 'undefined';
    }

    function constant(value) {
        return function () {
            return value;
        };
    }

    function named(type, key) {
        return key;
    }

    function ctor(dependencies, fn){
        fn.dependencies = dependencies;
        return fn;
    }

    function makeArray(args, startIndex) {
        return Array.prototype.slice.call(args, startIndex);
    }

    function chain(fn) {
        return function() {
            fn.apply(this, arguments);
            return this;
        }
    }

    function resolveFn() {
        throw new Error('inject.resolve can only be used as a dependency');
    }

    function scopeFn() {  } // Key for current scope

    function Registration(create) {
        this.factory = create;
        this.perContainer();
    }

    Registration.prototype = {
        forType: chain(function (type) {
            this.key = type;
        }),

        forKey: chain(function (key) {
            this.key = key;
        }),

        create: chain(function (type) {
            this.factory = constructor(type);
        }),

        use: chain(function (value){
            this.factory = constant(value);
        }),

        call: chain(function (fn){
            this.factory = fn;
        }),

        once: chain(function () {
            var key = this.key;
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return registeredScope(key, pcall(registeredResolve.fn, factory));
            };
        }),

        perContainer: chain(function () {
            var key = this.key;
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return currentScope(key, pcall(resolve.function, factory));
            };
        }),

        perDependency: chain(function () {
            this._lifeTime = function (factory, registeredResolve, registeredScope, resolve, currentScope) {
                return resolve.function(factory)
            };
        }),

        then: chain(function (callback) {
            var innerFactory = this.factory;
            this.factory = ctor(dependencyKeys(innerFactory), function () {
                var value = innerFactory.apply(this, arguments);
                callback(value);
                return value;
            });
        }),

        useParameterHook: chain(function (hook) {
            var innerFactory = this.factory;
            this.factory = ctor([resolveFn], function (resolve) {
                var originalKeys = dependencyKeys(innerFactory);
                var hookedKeys = originalKeys.map(function (key) {
                    var hookValue = hook(resolve, key);
                    return isDefined(hookValue)
                        ? new Registration(constant(hookValue))
                        : key;
                });

                return resolve.function(ctor(hookedKeys, pcall(innerFactory)));
            });
        }),

        build: function (registeredResolve, registeredScope) {
            return ctor([resolveFn, scopeFn],
                pcall(this._lifeTime, this.factory, registeredResolve, registeredScope));
        }
    };

    window.inject = function inject(registrations) {
        var scope = newScope();
        function resolve(key) { return resolveValue(resolve, key); }
        resolve.injected = lookup(
            (registrations || [])
                .map(function(r) {return r.key; })
                .concat(resolveFn, scopeFn),
            (registrations || [])
                .map(function(r) { return r.build(resolve, scope); })
                .concat(constant(resolve), constant(scope)));
        resolve.dispose = function() { };
        resolve.function = pcall(resolveFunction, resolve);
        return resolve;
    };

    window.inject.resolve = resolveFn;

    window.inject.forType = function (type) {
        return new Registration(constructor(type)).forType(type);
    };

    window.inject.forKey = function (key) {
        return new Registration().forKey(key);
    };

    window.inject.create = function (type) {
        return new Registration().forType(type).create(type);
    };

    window.inject.createSingle = function (type) {
        return new Registration().forType(type).create(type).once();
    };

    window.inject.call = function (fn) {
        return new Registration(fn);
    };

    window.inject.use = function (value) {
        return new Registration(constant(value));
    };

    window.ctor = ctor;
    window.construct = construct;
    window.func = func;
    window.optional = optional;
    window.named = named;
    window.Injection = { RegistrationBuilder: Registration }; // TODO remove, just for old tests
})();