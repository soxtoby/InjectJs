﻿(function (global) {
    'use strict';

    var uid = 1;

    function Builder() {
        this._registrations = [];
        this.useInstancePerContainer();
    };

    Builder.prototype = {
        build: function () {
            this._containerBuilt = true;

            var registrationMap = {};
            this._registrations.forEach(function (registration) {
                registrationMap[getOrCreateKey(registration.registeredAs)] = registration;
            });

            return new Container(registrationMap, this._defaultLifetime);
        },

        forType: function (type) {
            return this._createRegistration().create(type);
        },

        forKey: function (key) {
            return this._createRegistration().forKey(key);
        },

        create: function (type) {
            return this.forType(type);
        },

        createSingle: function (type) {
            return this._createRegistration().createSingle(type);
        },

        call: function (factory) {
            return this._createRegistration().call(factory);
        },

        use: function (value) {
            return this._createRegistration().use(value);
        },

        useSingleInstances: function () {
            this._defaultLifetime = singleInstance;
        },

        useInstancePerContainer: function () {
            this._defaultLifetime = instancePerContainer;
        },

        useInstancePerDependency: function () {
            this._defaultLifetime = instancePerDependency;
        },

        _createRegistration: function () {
            if (this._containerBuilt)
                throw new Error('Cannot register anything else once the container has been built');

            var registration = new Registration(this._defaultLifetime);
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(lifetime) {
        this._lifetime = lifetime || instancePerDependency;
        this.parameterHooks = [];
    }

    Registration.prototype = {
        forType: function (type) {
            return this.forKey(type);
        },

        forKey: function (key) {
            this.registeredAs = key;
            return this;
        },

        create: function (type) {
            if (!this.registeredAs)
                this.forType(type);
            return this.call(constructorFactory(type));
        },

        use: function (value) {
            return this.call(valueFactory(value));
        },

        call: function (factory) {
            this._instanceFactory = factory;
            return this;
        },

        once: function () {
            this._lifetime = singleInstance;
            return this;
        },

        createSingle: function (type) {
            return this.create(type).once();
        },

        perContainer: function () {
            this._lifetime = instancePerContainer;
            return this;
        },

        perDependency: function () {
            this._lifetime = instancePerDependency;
            return this;
        },

        factory: function (container) {
            return this._lifetime(this._instanceFactory)(container);
        },
        
        withArguments: function (parameters) {
            var args = arguments;
            for (var i = 0; i < args.length; i++) {
                (function (index, arg) {    
                    this.useParameterHook(function (p) {
                        return p.index == index;
                    }, function () {
                        return arg;
                    });
                }).bind(this)(i, args[i]);
            }
            return this;
        },

        forParameter: function (name) {
            return new ParameterRegistration(this, function (p) {
                return p.name == name;
            });
        },
        
        forParameterType: function(type) {
            return new ParameterRegistration(this, function(p) {
                return p.type == type;
            });
        },

        useParameterHook: function (matchParameter, resolveValue) {
            var hook = matchParameter instanceof ParameterHook
                ? matchParameter
                : new ParameterHook(matchParameter, resolveValue);
            this.parameterHooks.push(hook);
            return this;
        }
    };

    function instancePerDependency(instanceFactory) {
        return function (container) {
            var instance = instanceFactory(container);
            container.registerDisposable(instance);
            return instance;
        };
    }

    function singleInstance(instanceFactory) {
        var key = getOrCreateKey(this.registeredAs);
        return function (container) {
            return container._singleInstanceScope.getOrCreate(key, instanceFactory, container);
        };
    }

    function instancePerContainer(instanceFactory) {
        var key = getOrCreateKey(this.registeredAs);
        return function (container) {
            return container._containerScope.getOrCreate(key, instanceFactory, container);
        };
    }

    function ParameterRegistration(typeRegistration, matchParameter) {
        this._typeRegistration = typeRegistration;
        this._matchParameter = matchParameter;
    }

    ParameterRegistration.prototype = {
        use: function (value) {
            return this.call(function () { return value; });
        },

        create: function (type) {
            return this.call(function (c) { return c.resolve(type); });
        },
        
        call: function(factory) {
            return this._typeRegistration.useParameterHook(this._matchParameter, factory);
        }
    };

    function ParameterHook(matchParameter, resolveValue) {
        this.matches = matchParameter;
        this.resolve = resolveValue;
    }

    function Container(registrationMap, defaultLifetime) {
        this._registrations = registrationMap;
        this._defaultLifetime = defaultLifetime;
        this._disposables = [];
        this._singleInstanceScope = new InstanceScope(this);
        this._containerScope = new InstanceScope(this);
        this._registrationScope = [];

        this._registerSelf();
    };

    Container.prototype = {
        resolve: function (type) {
            var registration = this.getRegistration(type);

            this._registrationScope.push(registration);
            var resolved = registration.factory(this);
            this._registrationScope.pop();

            if (resolved == null)
                throw new Error(
                    (typeof type == 'function' ? "Type" : "'" + type + "'")
                    + ' resolved to ' + resolved);

            return resolved;
        },

        getRegistration: function (type) {
            var registration = type instanceof Registration
                ? type
                : this._registrations[getKey(type)];

            if (!registration && !(typeof type == 'function'))
                throw new Error("Nothing registered as '" + type + "'");

            return registration
               || new Registration(this._defaultLifetime).create(type);
        },

        resolveParameter: function (parameter) {
            var constructorRegistration = this._registrationScope[this._registrationScope.length - 1];

            if (constructorRegistration) {
                var parameterHooks = constructorRegistration.parameterHooks;
                for (var i = 0; i < parameterHooks.length; i++)
                    if (parameterHooks[i].matches(parameter))
                        return parameterHooks[i].resolve(this, parameter);
            }

            return this.resolve(parameter.type);
        },

        buildSubContainer: function (registration) {
            var builder = new Builder();

            if (registration)
                registration(builder);

            var subContainer = builder.build();

            subContainer._defaultLifetime = this._defaultLifetime;
            subContainer._singleInstanceScope = this._singleInstanceScope;

            Object.keys(this._registrations).forEach(function (key) {
                if (!(key in subContainer._registrations))
                    subContainer._registrations[key] = this._registrations[key];
            }, this);

            this.registerDisposable(subContainer);

            return subContainer;
        },

        registerDisposable: function (instance) {
            if (!instance || typeof instance.dispose != 'function')
                return;

            var oldDispose = instance.dispose;
            instance.dispose = function () {
                this._unregisterDisposable(instance);
                oldDispose.call(instance);
            }.bind(this);
            this._disposables.push(instance);
        },

        _unregisterDisposable: function (disposable) {
            extract(this._disposables, function (d) {
                return d == disposable;
            });
        },

        _registerSelf: function () {
            var key = getOrCreateKey(Container);
            this._registrations[key] = new Registration().forKey(key).use(this);
        },

        dispose: function () {
            this._disposables.slice().forEach(function (disposable) {
                disposable.dispose();
            });
        }
    };

    function InstanceScope(ownerContainer) {
        this._instances = {};
        this._ownerContainer = ownerContainer;
    }

    InstanceScope.prototype = {
        getOrCreate: function (key, instanceFactory, resolveScope) {
            return key in this._instances
                ? this._instances[key]
                : this.add(key, instanceFactory(resolveScope));
        },

        add: function (key, instance) {
            this._instances[key] = instance;
            this._ownerContainer.registerDisposable(instance);
            return instance;
        }
    };

    function constructorFactory(constructor) {
        var dependencies = constructor.dependencies || [];
        var paramNames = constructor.parameters
            || /\((.*?)\)/.exec(constructor.toString())[1]
                .split(',').map(function (p) { return p.trim(); });
        var parameters = dependencies.map(function (d, i) {
            return new Parameter(d, paramNames[i], i);
        });

        return function (container) {
            var args = parameters.map(container.resolveParameter, container);
            var resolvedConstructor = Function.prototype.bind.apply(constructor, [null].concat(args));
            return new resolvedConstructor();
        };
    }

    function Parameter(type, name, index) {
        this.type = type;
        this.name = name;
        this.index = index;
    }

    function valueFactory(value) {
        return function () {
            return value;
        };
    }

    function factoryFor(type, params) {
        return new Registration()
            .call(function (container) {
                return function () {
                    var specifiedParams = pairArgsWithParams(arguments);

                    var typeRegistration = container.getRegistration(type);
                    var parameterisedRegistration = buildParameterisedRegistration(typeRegistration, specifiedParams);

                    return container.resolve(parameterisedRegistration);
                };
            });

        function pairArgsWithParams(args) {
            return (params || []).map(function (paramType, i) {
                return { type: paramType, value: args[i] };
            });
        }

        function buildParameterisedRegistration(typeRegistration, specifiedParams) {
            var parameterisedRegistration = new Registration()
                .call(typeRegistration._instanceFactory)
                .useParameterHook(useSpecifiedParameter());

            typeRegistration.parameterHooks.forEach(function (hook) {
                parameterisedRegistration.useParameterHook(hook);
            });

            return parameterisedRegistration;

            function useSpecifiedParameter() {
                return new ParameterHook(
                    function (p) { return specifiedParams.some(matchesTypeOf(p)); },
                    function (c, p) { return extract(specifiedParams, matchesTypeOf(p)).value; });
            }
        }

        function matchesTypeOf(parameter) {
            return function (other) {
                return other.type == parameter.type;
            };
        }
    }

    function getOrCreateKey(type) {
        var key = getKey(type);
        return key
            ? key
            : (type.$injectId = uid++);
    }

    function getKey(type) {
        return typeof type == 'string'
            ? type
            : type.$injectId;
    }

    function ctor(dependencies, constructor) {
        constructor.dependencies = dependencies;
        return constructor;
    }

    function extract(array, predicate) {
        for (var i = 0; i < array.length; i++) {
            if (predicate(array[i])) {
                return array.splice(i, 1)[0];
            }
        }
    }

    global.Injection = {
        Builder: Builder,
        Registration: Registration,
        Container: Container,
        Parameter: Parameter,
        ctor: ctor,
        factoryFor: factoryFor
    };
})(window);
