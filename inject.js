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

        register: function (constructor) {
            if (this._containerBuilt)
                throw new PostBuildRegistrationError();

            var registration = new Registration(constructor);
            this._registrations.push(registration);
            return registration;
        }
    };

    function Registration(value) {
        this.value = value;
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

            var registration = this._registrations[key];
            if (registration) {
                if (typeof registration.value == 'function')
                    return this._construct(registration.value);
                else
                    return registration.value;
            }

            return this._construct(type);
        },

        _construct: function (constructor) {
            var dependencies = constructor.dependencies || [];
            var args = dependencies.map(this.resolve, this);

            var resolvedConstructor = Function.prototype.bind.apply(constructor, [null].concat(args));
            return new resolvedConstructor();
        }
    };

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
        ctor: ctor
    };
})(window);