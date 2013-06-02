(function (global) {
    'use strict';

    var uid = 1;
    var parameterMarker = 'param:';
    var undefined;

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

        forParameter: function (name) {
            return this._createRegistration().forParameter(name);
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
            if (typeof type != 'function')
                throw new Error('Registration type is not a function');

            this.name = type.name;
            this.registeredAs = type;

            this._ensureTyping();

            return this;
        },

        forKey: function (key) {
            if (typeof key != 'string')
                throw new Error('Registration key is not a string');

            this.name = "'" + key + "'";
            this.registeredAs = key;
            return this;
        },

        forParameter: function (name) {
            if (typeof name != 'string')
                throw new Error('Parameter name is not a string');

            this.name = "param: '" + name + "'";
            this.registeredAs = paramKey(name);
            return this;
        },

        create: function (type) {
            if (!this.registeredAs)
                this.forType(type);

            if (typeof type != 'function')
                throw new Error('Type is not a function');

            this._resolvesTo = type;
            this._ensureTyping();

            return this.call(constructorFactory(type));
        },

        use: function (value) {
            if (value === undefined)
                throw new Error('Value is undefined');

            this._resolvesTo = value;
            this._ensureTyping();

            this._lifetime = unmanagedLifetime;

            return this.call(valueFactory(value));
        },

        call: function (factory) {
            if (typeof factory != 'function')
                throw new Error('Factory is not a function');

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

        withArguments: function () {
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

        withParameters: function (parameters) {
            Object.keys(parameters).forEach(function (name) {
                this.withParameterNamed(name).using(parameters[name]);
            }, this);
            return this;
        },

        withParameterNamed: function (name) {
            if (typeof name != 'string')
                throw new Error('Parameter name is not a string');

            return new ParameterRegistration(this, function (p) {
                return p.name == name;
            });
        },

        withParameterTyped: function (type) {
            if (typeof type != 'function')
                throw new Error('Parameter type is not a function');

            return new ParameterRegistration(this, function (p) {
                return p.type == type;
            }, type);
        },

        useParameterHook: function (matchParameter, resolveValue) {
            var hook = matchParameter instanceof ParameterHook
                ? matchParameter
                : new ParameterHook(matchParameter, resolveValue);
            this.parameterHooks.push(hook);
            return this;
        },

        then: function (callback) {
            this._postBuild = function (instanceFactory) {
                return function (container) {
                    var value = instanceFactory(container);
                    callback(value, container);
                    return value;
                };
            };
        },

        _postBuild: function (instanceFactory) {
            return instanceFactory;
        },

        _ensureTyping: function () {
            ensureTyping(this.registeredAs, this._resolvesTo);
        },

        factory: function (container) {
            return this._lifetime(this._postBuild(this._instanceFactory))(container);
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

    function unmanagedLifetime(instanceFactory) {
        return function (container) {
            return instanceFactory(container);
        };
    }

    function ParameterRegistration(typeRegistration, matchParameter, parameterType) {
        this._typeRegistration = typeRegistration;
        this._matchParameter = matchParameter;
        this._parameterType = parameterType;
    }

    ParameterRegistration.prototype = {
        creating: function (type) {
            if (typeof type != 'function')
                throw new Error('Type is not a function');

            ensureTyping(this._parameterType, type);

            return this.calling(function (c) { return c.resolve(type); });
        },

        using: function (value) {
            if (value === undefined)
                throw new Error('Value is undefined');

            ensureTyping(this._parameterType, value);

            return this.calling(function () { return value; });
        },

        calling: function (factory) {
            if (typeof factory != 'function')
                throw new Error('Factory is not a function');

            return this._typeRegistration.useParameterHook(this._matchParameter, factory);
        }
    };

    function ParameterHook(matchParameter, resolveValue) {
        if (typeof matchParameter != 'function') throw new Error('Match callback is not a function');
        if (typeof resolveValue != 'function') throw new Error('Resolve callback is not a function');

        this.matches = matchParameter;
        this.resolve = resolveValue;
    }

    function ensureTyping(baseType, subType) {
        if (typeof baseType != 'function' || subType === null)
            return;

        var doesNotInherit = ' does not inherit from ' + (baseType.name || 'anonymous base type');

        if (typeof subType == 'function') {
            if (baseType != subType && !(subType.prototype instanceof baseType))
                throw new Error((subType.name || 'Anonymous type') + doesNotInherit);
        } else if (typeof subType == 'object') {
            if (!(subType instanceof baseType))
                throw new Error('Value' + doesNotInherit);
        }
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
            if (type == null)
                throw new Error("Tried to resolve '" + type + "'");

            var registration = this.getRegistration(type);

            this._registrationScope.push(registration);
            var resolved = registration.factory(this);
            this._registrationScope.pop();

            if (resolved === undefined)
                throw new Error("Failed to resolve " + registration.name + this._resolveChain());

            ensureTyping(type, resolved);

            return resolved;
        },

        getRegistration: function (type) {
            var registration = type instanceof Registration
                ? type
                : this._registrations[getKey(type)];

            if (!registration && typeof type == 'string')
                throw new Error("Failed to resolve key '" + type + "'" + this._resolveChain());

            return registration
               || new Registration(this._defaultLifetime).create(type);
        },

        _resolveChain: function () {
            return this._registrationScope.length
                ? " while attempting to resolve "
                    + this._registrationScope
                        .map(function (r) { return r.name; })
                        .join(' -> ')
                : '';
        },

        resolveParameter: function (parameter) {
            var constructorRegistration = this._registrationScope[this._registrationScope.length - 1];

            if (constructorRegistration) {
                var parameterHooks = constructorRegistration.parameterHooks;
                for (var i = 0; i < parameterHooks.length; i++)
                    if (parameterHooks[i].matches(parameter))
                        return parameterHooks[i].resolve(this, parameter);
            }

            if (parameter.type)
                return this.resolve(parameter.type);

            var key = paramKey(parameter.name);
            if (this.isRegistered(key))
                return this.resolve(key);
        },

        buildSubContainer: function (registration) {
            var builder = new Builder();

            if (registration)
                registration(builder);

            var subContainer = builder.build();

            subContainer._defaultLifetime = this._defaultLifetime;
            subContainer._singleInstanceScope = this._singleInstanceScope;

            Object.keys(this._registrations).forEach(function (key) {
                if (!subContainer.isRegistered(key))
                    subContainer._registrations[key] = this._registrations[key];
            }, this);

            this.registerDisposable(subContainer);

            return subContainer;
        },

        isRegistered: function (type) {
            return getKey(type) in this._registrations;
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
            this._registrations[key] = new Registration().forType(Container).use(this);
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
            || /\(([^\)]*)\)/.exec(constructor.toString())[1]
                .split(',')
                .map(function (p) { return p.trim(); })
                .filter(function (p) { return !!p; });

        var parameters = paramNames.map(function (p, i) {
            return new Parameter(dependencies[i], p, i);
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

    function optional(type, defaultValue) {
        if (defaultValue === undefined)
            defaultValue = null;
        return new Registration()
            .call(function (container) {
                return container.isRegistered(type)
                    ? container.resolve(type)
                    : defaultValue;
            });
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

    function paramKey(name) {
        return parameterMarker + name;
    }

    function ctor(dependencies, constructor) {
        if (dependencies.some(function (d) { return !d; }))
            throw new Error((constructor.name || 'Type') + ' has an undefined dependency');

        if (dependencies.length != constructor.length)
            throw new Error((constructor.name || 'Type') + ' has ' + dependencies.length + ' dependencies, but ' + constructor.length + ' parameter(s)');

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
        factoryFor: factoryFor,
        optional: optional
    };
})(window);
