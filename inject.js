(function (global) {
    'use strict';

    var uid = 1;

    function Builder() {
        this._registrations = [];
    };

    Builder.prototype = {
        build: function () {
            this._containerBuilt = true;
            return new Container(this._registrations);
        },

        register: function (type) {
            if (this._containerBuilt)
                throw new Error('Cannot register anything else once the container has been built');

            var factory = typeof type == 'function'
                ? constructorFactory(type)
                : valueFactory(type);
            var registration = this.registerFactory(factory);
            registration.as(type);
            return registration;
        },

        registerFactory: function (factory) {
            var registration = new Registration(factory);
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(factory) {
        this.factory = factory;
        this.registeredAs = [];
        this.parameterHooks = [];
        this._id = uid++;
    }

    Registration.prototype = {
        as: function (interfaces) {
            this.registeredAs = this.registeredAs.concat(interfaces);
            return this;
        },

        singleInstance: function () {
            var instanceFactory = this.factory;
            var instance;
            this.factory = function (container) {
                return instance
                    || (instance = instanceFactory(container));
            };
            return this;
        },

        instancePerContainer: function () {
            var instanceFactory = this.factory;
            this.factory = function (container) {
                if (!(this._id in container._containerScopedInstances))
                    container._containerScopedInstances[this._id] = instanceFactory(container);
                return container._containerScopedInstances[this._id];
            };
            return this;
        },

        withParameter: function (matchParameter, resolveValue) {
            this.parameterHooks.push(new ParameterHook(matchParameter, resolveValue));
            return this;
        }
    };

    function ParameterHook(matchParameter, resolveValue) {
        this.matches = matchParameter;
        this.resolve = resolveValue;
    }

    function Container(registrations) {
        this._registrations = {};
        this._disposables = [];
        this._containerScopedInstances = {};
        this._registrationScope = [];

        registrations.forEach(function (registration) {
            registration.registeredAs.forEach(function (type) {
                this._registrations[getOrCreateKey(type)] = registration;
            }, this);
        }, this);
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

            if (typeof resolved.dispose == 'function')
                this._registerDisposable(resolved);

            return resolved;
        },

        getRegistration: function (type) {
            var registration = type instanceof Registration
                ? type
                : this._registrations[getKey(type)];

            if (!registration && !(typeof type == 'function'))
                throw new Error("Nothing registered as '" + type + "'");

            return registration
               || new Registration(constructorFactory(type));
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

            Object.keys(this._registrations).forEach(function (key) {
                if (!(key in subContainer._registrations))
                    subContainer._registrations[key] = this._registrations[key];
            }, this);

            this._registerDisposable(subContainer);

            return subContainer;
        },

        _registerDisposable: function (disposable) {
            var oldDispose = disposable.dispose;
            disposable.dispose = function () {
                this._unregisterDisposable(disposable);
                oldDispose.call(disposable);
            }.bind(this);
            this._disposables.push(disposable);
        },

        _unregisterDisposable: function (disposable) {
            extract(this._disposables, function (d) {
                return d == disposable;
            });
        },

        dispose: function () {
            this._disposables.slice().forEach(function (disposable) {
                disposable.dispose();
            });
        }
    };

    function constructorFactory(constructor) {
        var dependencies = constructor.dependencies || [];
        var paramNames = /\((.*?)\)/.exec(constructor.toString())[1]
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
        return new Registration(function (container) {
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
            var parameterisedRegistration = new Registration(typeRegistration.factory);
            parameterisedRegistration.parameterHooks = [useSpecifiedParameter()]
                .concat(typeRegistration.parameterHooks);
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

    global.Inject = {
        Builder: Builder,
        Container: Container,
        Parameter: Parameter,
        ctor: ctor,
        factoryFor: factoryFor
    };
})(window);
