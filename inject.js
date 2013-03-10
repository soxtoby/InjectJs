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
                throw new PostBuildRegistrationError();

            var registration = typeof type == "function"
                ? new Registration(constructorFactory(type))
                : new Registration(instanceFactory(type));
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(factory) {
        this.factory = factory;
        this.registeredAs = [];
    }

    Registration.prototype = {
        as: function (interfaces) {
            this.registeredAs = this.registeredAs.concat(interfaces);
        }
    };

    function Container(registrations) {
        this._registrations = {};
        registrations.forEach(function (registration) {
            registration.registeredAs.forEach(function (type) {
                this._registrations[getOrCreateKey(type)] = registration;
            }, this);
        }, this);
    };

    Container.prototype = {
        resolve: function (type) {
            var key = getKey(type);

            var registration = type instanceof Registration
                ? type
                : this._registrations[key];
            return registration
                ? registration.factory(this)
                : constructorFactory(type)(this);
        }
    };

    function constructorFactory(constructor) {
        return function (container) {
            var dependencies = constructor.dependencies || [];
            var args = dependencies.map(container.resolve, container);

            var resolvedConstructor = Function.prototype.bind.apply(constructor, [null].concat(args));
            return new resolvedConstructor();
        };
    }

    function instanceFactory(value) {
        return function () {
            return value;
        };
    }

    function factoryFor(type) {
        return new Registration(function(container) {
            return function () {
                return container.resolve(type);
            };
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

    function ctor(dependencies, constructor) {
        constructor.dependencies = dependencies;
        return constructor;
    }

    function PostBuildRegistrationError() {
        this.message = 'Cannot register anything else once the container has been built';
    }
    PostBuildRegistrationError.prototype = new Error();

    global.Inject = {
        Builder: Builder,
        ctor: ctor,
        factoryFor: factoryFor
    };
})(window);