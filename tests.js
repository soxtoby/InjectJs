describe("inject.js", function () {
    function type() { }
    function dependency1() { }
    function dependency2() { }
    function typeWithDependencies(d1, d2) {
        this.dependency1 = d1;
        this.dependency2 = d2;
    }
    typeWithDependencies.dependencies = [dependency1, dependency2];
    function disposableType() {
        this.dispose = this.disposeMethod = sinon.spy();
    }
    var builder = new Injection.Builder();

    describe("empty container", function () {
        var sut = builder.build();

        when("resolving existing class", function () {
            function unregisteredClass() { };
            var result = sut.resolve(unregisteredClass);

            it("instantiates unregistered class", function () {
                result.should.be.an.instanceOf(unregisteredClass);
            });
        });

        when("resolving existing class with parameter but no specified dependencies", function () {
            function typeWithParameter(param) { this.arg = param; }
            var result = sut.resolve(typeWithParameter);

            it("resolves to instance of type with nothing passed in", function () {
                result.should.be.an.instanceOf(typeWithParameter);
                expect(result.arg).to.be.undefined;
            });
        });

        when("type has multiple dependencies", function () {
            when("resolving type", function () {
                var result = sut.resolve(typeWithDependencies);

                it("instantiates type with dependencies", function () {
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with no parameters", function () {
                var factory = sut.resolve(Injection.factoryFor(typeWithDependencies));

                then("calling factory instantiates type with dependencies", function () {
                    var result = factory();
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with partial parameters", function () {
                var factory = sut.resolve(Injection.factoryFor(typeWithDependencies, [dependency2]));

                when("calling factory function", function () {
                    var dependency2Instance = new dependency2();
                    var result = factory(dependency2Instance);

                    then("type constructed with passed in dependency", function () {
                        result.dependency2.should.equal(dependency2Instance);
                    });
                });
            });
        });

        when("resolving optional dependency", function () {
            when("with no default value", function () {
                var result = sut.resolve(Injection.optional(type));

                it("resolves to null", function () {
                    expect(result).to.equal(null);
                });
            });

            when("with a default value", function () {
                var expectedValue = {};
                var result = sut.resolve(Injection.optional(type, expectedValue));

                it("resolves to default value", function () {
                    result.should.equal(expectedValue);
                });
            });

            when("dependency has been registered", function () {
                sut = sut.buildSubContainer(function (b) {
                    b.create(type);
                });
                var result = sut.resolve(Injection.optional(type));

                it("resolves dependency", function () {
                    result.should.be.an.instanceOf(type);
                });
            });
        });

        when("resolving a container", function () {
            var result = sut.resolve(Injection.Container);

            then("same container instance is returned", function () {
                result.should.equal(sut);
            });
        });
    });

    describe("type registration", function () {
        when("setting up a registration for a type", function () {
            var registration = builder.forType(type);

            when("subtype created for type", function () {
                function subType() { }
                subType.prototype = new type();
                var chain = registration.create(subType);
                var sut = builder.build();

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("resolving type", function () {
                    var result = sut.resolve(type);

                    it("instantiates the sub type", function () {
                        result.should.be.an.instanceOf(subType);
                    });
                });
            });

            when("value used for type", function () {
                var value = new type();
                var chain = registration.use(value);
                var sut = builder.build();

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("type is resolved", function () {
                    var result = sut.resolve(type);

                    it("resolves to the object", function () {
                        result.should.equal(value);
                    });
                });
            });

            when("factory method called for type", function () {
                var expectedResult = new type();
                var factory = sinon.stub().returns(expectedResult);
                var chain = registration.call(factory);
                var sut = builder.build();

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("type is resolved", function () {
                    var result = sut.resolve(type);

                    then("container is passed in to factory", function () {
                        factory.firstCall.args[0].should.be.an.instanceOf(Injection.Container);
                    });

                    then("resolves to factory return value", function () {
                        result.should.equal(expectedResult);
                    });
                });
            });
        });

        when("setting up a registration for a key", function () {
            var registration = builder.forKey('named');

            when("type created for key", function () {
                registration.create(type);

                when("resolving named dependency", function () {
                    var result = builder.build().resolve('named');

                    it("resolves to instance of the registered type", function () {
                        result.should.be.an.instanceOf(type);
                    });
                });

                when("another type is registered with a different name", function () {
                    function type2() { }

                    builder.forKey('different').create(type2);
                    var sut = builder.build();

                    when("resolving first name", function () {
                        var result = sut.resolve('named');

                        it("resolves to instance of the first type", function () {
                            result.should.be.an.instanceOf(type);
                        });
                    });

                    when("resolving the second name", function () {
                        var result = sut.resolve('different');

                        it("resolves to instance of the second type", function () {
                            result.should.be.an.instanceOf(type2);
                        });
                    });
                });
            });
        });

        when("setting up a registration for a parameter name", function () {
            var registration = builder.forParameter('param');

            when("type created for parameter", function () {
                registration.create(type);

                when("resolving type with registered parameter name", function () {
                    function typeWithParameter(param) {
                        this.arg = param;
                    }
                    var result = builder.build().resolve(typeWithParameter);

                    it("resolves to instance of resolved type", function () {
                        result.should.be.an.instanceOf(typeWithParameter);
                    });

                    it("creates resolved type with instance of registered parameter type", function () {
                        result.arg.should.be.an.instanceOf(type);
                    });
                });

                when("resolving type with registered parameter name on new line", function () {
                    // It's important that this function's parameter name is on a different line
                    // to the '(', to test the function parameter parsing
                    function typeWithParameter(
                                param) {
                        this.arg = param;
                    }
                    var result = builder.build().resolve(typeWithParameter);

                    it("resolves to instance of resolved type", function () {
                        result.should.be.an.instanceOf(typeWithParameter);
                    });

                    it("creates resolved type with instance of registered parameter type", function () {
                        result.arg.should.be.an.instanceOf(type);
                    });
                });
            });
        });

        when("type specifies its own parameter names", function () {
            var typeWithParameters = Injection.ctor(['foo'], function (originalName) { });
            typeWithParameters.parameters = ['specifiedName'];

            when("type is registered with parameter hook", function () {
                var parameterResolver = sinon.stub().returns({});
                builder.forType(typeWithParameters)
                    .useParameterHook(function () { return true; }, parameterResolver);
                var sut = builder.build();

                when("type is resolved", function () {
                    sut.resolve(typeWithParameters);

                    then("parameter resolver called with type's parameter name", function () {
                        parameterResolver.firstCall.args[1].name.should.equal('specifiedName');
                    });
                });
            });
        });

        when("registering a constructor", function () {
            var registration = builder.create(type);
            var sut = builder.build();

            then("registration is returned", function () {
                registration.should.be.an.instanceOf(Injection.Registration);
            });

            when("type is resolved", function () {
                var result = sut.resolve(type);

                then("type resolves to instance of type", function () {
                    result.should.be.an.instanceOf(type);
                });
            });
        });

        when("registering constructor as a singleton", function () {
            var registration = builder.createSingle(type);
            var sut = builder.build();

            then("registration is returned", function () {
                registration.should.be.an.instanceOf(Injection.Registration);
            });

            when("resolving type twice", function () {
                var result1 = sut.resolve(type);
                var result2 = sut.resolve(type);

                then("type resolves to the same instance", function () {
                    result1.should.equal(result2);
                });
            });
        });

        when("registering a factory method", function () {
            var expectedResult;
            var registration = builder.call(function () { return expectedResult; });

            then("registration is returned", function () {
                registration.should.be.an.instanceOf(Injection.Registration);
            });

            when("registration is set up for type", function () {
                var chain = registration.forType(type);
                var sut = builder.build();

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("factory returns type instance & type is resolved", function () {
                    expectedResult = new type();
                    var result = sut.resolve(type);

                    then("type resolves to factory return value", function () {
                        result.should.equal(expectedResult);
                    });
                });

                when("factory returns null & type is resolved", function () {
                    expectedResult = null;
                    var result = sut.resolve(type);

                    then("type resolves to null", function () {
                        should.equal(result, null);
                    });
                });
            });
        });

        when("registering a value", function () {
            var value = {};
            var registration = builder.use(value);

            then("registration is returned", function () {
                registration.should.be.an.instanceOf(Injection.Registration);
            });

            when("registration is set up for key", function () {
                var chain = registration.forKey('key');
                var sut = builder.build();

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("key is resolved", function () {
                    var result = sut.resolve('key');

                    then("key resolves to value", function () {
                        result.should.equal(value);
                    });
                });
            });
        });

        when("registering a null value for a type", function () {
            builder.use(null).forType(type);

            when("type is resolved", function () {
                var result = builder.build().resolve(type);

                it("resolves type to null", function () {
                    should.equal(result, null);
                });
            });
        });

        when("registering a post-build function", function () {
            var callback = sinon.spy(function (o) {
                o.callbackProperty = true;
            });
            builder.create(type).then(callback);
            var sut = builder.build();

            when("type is resolved", function () {
                var result = sut.resolve(type);

                then("callback is called with resolved value and container", function () {
                    callback.should.have.been.calledWith(result, sut);
                });
            });
        });
    });

    describe("parameter registration", function () {
        var typeRegistration = builder.forType(typeWithDependencies);

        when("type is registered with parameter hook", function () {
            var dependency1Instance = new dependency1();
            var parameterResolver = sinon.stub().returns(dependency1Instance);
            typeRegistration
                .useParameterHook(
                    function (p) { return p.type == dependency1; },
                    parameterResolver);
            var sut = builder.build();

            when("type is resolved", function () {
                var result = sut.resolve(typeWithDependencies);

                then("parameter resolver called with container & parameter", function () {
                    var args = parameterResolver.firstCall.args;
                    args[0].should.be.an.instanceOf(Injection.Container);
                    args[1].should.deep.equal(new Injection.Parameter(dependency1, 'd1', 0));
                });

                then("parameter is resolved to parameter factory result", function () {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });
        });

        when("registering a named parameter", function () {
            var parameterRegistration = typeRegistration.withParameterNamed('d2');

            when("value specified for parameter", function () {
                var dependency2Instance = new dependency2();
                var chain = parameterRegistration.using(dependency2Instance);

                it("can be chained", function () {
                    chain.should.equal(typeRegistration);
                });

                when("type is resolved", function () {
                    var result = builder.build().resolve(typeWithDependencies);

                    then("type is resolved with specified value", function () {
                        result.dependency2.should.equal(dependency2Instance);
                    });
                });
            });

            when("null value specified for parameter", function () {
                parameterRegistration.using(null);

                when("type is resolved", function () {
                    var result = builder.build().resolve(typeWithDependencies);

                    then("type is resolved with null value", function () {
                        should.equal(result.dependency2, null);
                    });
                });
            });

            when("subtype specified for parameter", function () {
                function dependency2SubType() { }
                dependency2SubType.prototype = new dependency2();
                var chain = parameterRegistration.creating(dependency2SubType);

                it("can be chained", function () {
                    chain.should.equal(typeRegistration);
                });

                when("type is resolved", function () {
                    var result = builder.build().resolve(typeWithDependencies);

                    then("type is resolved with instance of subtype", function () {
                        result.dependency2.should.be.an.instanceOf(dependency2SubType);
                    });
                });
            });

            when("factory method specified for parameter", function () {
                var dependency2Instance = new dependency2();
                var factoryMethod = sinon.stub().returns(dependency2Instance);
                var chain = parameterRegistration.calling(factoryMethod);

                it("can be chained", function () {
                    chain.should.equal(typeRegistration);
                });

                when("type is resolved", function () {
                    var sut = builder.build();
                    var result = sut.resolve(typeWithDependencies);

                    then("factory method called with container & parameter", function () {
                        var args = factoryMethod.firstCall.args;
                        args[0].should.equal(sut);
                        args[1].should.deep.equal(new Injection.Parameter(dependency2, 'd2', 1));
                    });

                    then("type is resolved to factory method's return value", function () {
                        result.dependency2.should.equal(dependency2Instance);
                    });
                });
            });
        });

        when("registering a typed parameter", function () {
            var parameterRegistration = typeRegistration.withParameterTyped(dependency2);

            when("value specified for parameter", function () {
                var dependency2Instance = new dependency2();
                parameterRegistration.using(dependency2Instance);

                when("type is resolved", function () {
                    var result = builder.build().resolve(typeWithDependencies);

                    then("type is resolved with specified value", function () {
                        result.dependency2.should.equal(dependency2Instance);
                    });
                });
            });
        });

        when("registering arguments", function () {
            var dependency1Instance = new dependency1();
            var dependency2Instance = new dependency2();
            var chain = typeRegistration.withArguments(dependency1Instance, dependency2Instance);

            it("can be chained", function () {
                chain.should.equal(typeRegistration);
            });

            when("type is resolved", function () {
                var result = builder.build().resolve(typeWithDependencies);

                then("type is resolved with specified values", function () {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.equal(dependency2Instance);
                });
            });
        });

        when("registering parameters by name", function () {
            var dependency2Instance = new dependency2();
            var chain = typeRegistration.withParameters({
                d2: dependency2Instance
            });

            it("can be chained", function () {
                chain.should.equal(typeRegistration);
            });

            when("type is resolved", function () {
                var result = builder.build().resolve(typeWithDependencies);

                then("type is resolved with specified values", function () {
                    result.dependency2.should.equal(dependency2Instance);
                });
            });
        });
    });

    describe("sub-containers", function () {
        when("building a sub-container", function () {
            var registration = sinon.spy();
            var sut = builder.build();
            sut.buildSubContainer(registration);

            then("registration callback is called with a Builder", function () {
                registration.firstCall.args[0].should.be.an.instanceOf(Injection.Builder);
            });
        });

        when("type is registered in original container", function () {
            builder.forKey('foo').create(type);
            var outer = builder.build();
            var inner = outer.buildSubContainer();

            then("type can be resolved from inner container", function () {
                inner.resolve('foo').should.be.an.instanceOf(type);
            });
        });

        when("type is registered in sub-container", function () {
            var outer = builder.build();
            var inner = outer.buildSubContainer(function (innerBuilder) {
                innerBuilder.forKey('foo').create(type);
            });

            then("type can't be resolved from outer container", function () {
                (function () { outer.resolve('foo'); })
                    .should.throw();
            });

            then("type can be resolved from inner container", function () {
                inner.resolve('foo').should.be.an.instanceOf(type);
            });
        });

        when("outer container is disposed", function () {
            var outer = builder.build();
            var inner = outer.buildSubContainer();
            this.spy(inner, 'dispose');

            outer.dispose();

            then("inner container is disposed", function () {
                inner.dispose.should.have.been.called;
            });
        });

        when("inner container is disposed", function () {
            var outer = builder.build();
            var inner = outer.buildSubContainer();
            inner.dispose();
            this.spy(inner, 'dispose');

            when("outer container is disposed", function () {
                outer.dispose();

                then("inner container is not disposed again", function () {
                    inner.dispose.should.not.have.been.called;
                });
            });
        });
    });

    describe("lifetimes", function () {
        when("registered as singleton", function () {
            var registration = builder.forType(disposableType);
            var chain = registration.once();
            var outer = builder.build();

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("resolved twice from same container", function () {
                var result1 = outer.resolve(disposableType);
                var result2 = outer.resolve(disposableType);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = outer.buildSubContainer();
                var innerResult = inner.resolve(disposableType);
                var outerResult = outer.resolve(disposableType);

                then("same instance returned both times", function () {
                    outerResult.should.equal(innerResult);
                });

                when("inner container is disposed", function () {
                    inner.dispose();

                    then("resolved object is not disposed", function () {
                        innerResult.disposeMethod.should.not.have.been.called;
                    });
                });

                when("outer container is disposed", function () {
                    outer.dispose();

                    then("resolved object is disposed", function () {
                        innerResult.disposeMethod.should.have.been.called;
                    });
                });
            });
        });

        when("registered with instance per container lifetime", function () {
            var registration = builder.forType(disposableType);
            var chain = registration.perContainer();
            var outer = builder.build();

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("resolved twice from same container", function () {
                var result1 = outer.resolve(disposableType);
                var result2 = outer.resolve(disposableType);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = outer.buildSubContainer();
                var result1 = outer.resolve(disposableType);
                var result2 = inner.resolve(disposableType);

                then("two separate instances are created", function () {
                    result1.should.not.equal(result2);
                });

                when("inner container is disposed", function () {
                    inner.dispose();

                    then("object resolved from outer container is not disposed", function () {
                        result1.disposeMethod.should.not.have.been.called;
                    });

                    then("object resolved from inner container is disposed", function () {
                        result2.disposeMethod.should.have.been.called;
                    });
                });

                when("outer container is disposed", function () {
                    outer.dispose();

                    then("object resolved from outer container is disposed", function () {
                        result1.disposeMethod.should.have.been.called;
                    });

                    then("object resolved from inner container is disposed", function () {
                        result2.disposeMethod.should.have.been.called;
                    });
                });
            });
        });

        when("registered with instance per dependency lifetime", function () {
            var registration = builder.forType(disposableType);
            var chain = registration.perDependency();

            var sut = builder.build();

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("type is resolved twice", function () {
                var result1 = sut.resolve(disposableType);
                var result2 = sut.resolve(disposableType);

                then("two separate instances are created", function () {
                    result1.should.not.equal(result2);
                });

                when("container is disposed", function () {
                    sut.dispose();

                    then("resolved objects are disposed as well", function () {
                        result1.disposeMethod.should.have.been.called;
                        result2.disposeMethod.should.have.been.called;
                    });
                });

                when("resolved object is disposed", function () {
                    result1.dispose();

                    when("container is disposed", function () {
                        sut.dispose();

                        then("disposed resolved object is not disposed again", function () {
                            result1.disposeMethod.should.have.been.calledOnce;
                        });
                    });
                });
            });
        });

        when("no default lifetime specified", function () {
            whenNothingIsRegistered(typeIsResolvedToInstancePerContainer);
            whenTypeIsRegisteredWithDefaultLifetime(typeIsResolvedToInstancePerContainer);
        });

        when("default lifetime set to singleton", function () {
            builder.useSingleInstances();

            whenNothingIsRegistered(typeIsResolvedToSingleton);

            whenTypeIsRegisteredWithDefaultLifetime(typeIsResolvedToSingleton);

            whenTypeIsRegisteredWithInstancePerDependencyLifetime(typeIsResolvedToInstancePerDependency);
        });

        when("default lifetime set to instance per container", function () {
            builder.useInstancePerContainer();

            whenNothingIsRegistered(typeIsResolvedToInstancePerContainer);

            whenTypeIsRegisteredWithDefaultLifetime(typeIsResolvedToInstancePerContainer);

            whenTypeIsRegisteredWithInstancePerDependencyLifetime(typeIsResolvedToInstancePerDependency);
        });

        when("default lifetime set to instance per dependency", function () {
            builder.useInstancePerDependency();

            whenNothingIsRegistered(typeIsResolvedToInstancePerDependency);

            whenTypeIsRegisteredWithDefaultLifetime(typeIsResolvedToInstancePerDependency);

            when("type is registered with singleton lifetime", function () {
                builder.createSingle(type);
                var sut = builder.build();

                typeIsResolvedToSingleton(sut);
            });
        });

        function whenNothingIsRegistered(assert) {
            when("nothing is registered", function () {
                var sut = builder.build();
                assert(sut);
            });
        }

        function whenTypeIsRegisteredWithDefaultLifetime(assert) {
            when("type is registered with default lifetime", function () {
                builder.create(type);
                var sut = builder.build();

                assert(sut);
            });
        }

        function whenTypeIsRegisteredWithInstancePerDependencyLifetime(assert) {
            when("type is registered with instance per dependency lifetime", function () {
                builder.create(type).perDependency();
                var sut = builder.build();

                assert(sut);
            });
        }

        function typeIsResolvedToSingleton(container) {
            when("resolved twice from same container", function () {
                var result1 = container.resolve(type);
                var result2 = container.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = container.buildSubContainer();
                var result1 = container.resolve(type);
                var result2 = inner.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });
        }

        function typeIsResolvedToInstancePerContainer(container) {
            when("resolved twice from same container", function () {
                var result1 = container.resolve(type);
                var result2 = container.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = container.buildSubContainer();
                var result1 = container.resolve(type);
                var result2 = inner.resolve(type);

                then("two separate instances are created", function () {
                    result1.should.not.equal(result2);
                });
            });
        }

        function typeIsResolvedToInstancePerDependency(container) {
            when("resolved twice", function () {
                var result1 = container.resolve(type);
                var result2 = container.resolve(type);

                then("two separate instances are created", function () {
                    result1.should.not.equal(result2);
                });
            });
        }
    });

    describe("errors", function () {
        when("container built with nothing registered", function () {
            var sut = builder.build();

            when("registering another type", function () {
                var action = (function () { builder.forType(function () { }); });

                it("throws with appropriate message", function () {
                    action.should.throw('Cannot register anything else once the container has been built');
                });
            });

            when("resolving an unregistered name", function () {
                var action = (function () { sut.resolve('foo'); });

                it("throws with name in message", function () {
                    action.should.throw("Failed to resolve key 'foo'");
                });
            });

            when("resolving type with an unregistered named dependency", function () {
                function typeWithNamedDependency(d1) { }
                typeWithNamedDependency.dependencies = ['unregistered'];
                var action = function () { sut.resolve(typeWithNamedDependency); };

                it("throws with resolve chain in messsage", function () {
                    action.should.throw("Failed to resolve key 'unregistered'"
                        + " while attempting to resolve typeWithNamedDependency");
                });
            });

            when("resolving null", function () {
                var action = function () { sut.resolve(null); };

                it("throws with null in message", function () {
                    action.should.throw("Tried to resolve 'null'");
                });
            });

            then("resolving undefined", function () {
                var action = function () { sut.resolve(); };

                it("throws with undefined in message", function () {
                    action.should.throw("Tried to resolve 'undefined'");
                });
            });
        });

        when("resolving to undefined", function () {
            builder.forType(type).call(function () { });
            var action = function () { builder.build().resolve(type); };

            it("throws with undefined in message", function () {
                action.should.throw("Failed to resolve type");
            });
        });

        when("resolving to wrong type", function () {
            builder.forType(type).call(function () { return {}; });
            var action = function () { builder.build().resolve(type); };

            it("throws", function () {
                action.should.throw('Value does not inherit from type');
            });
        });

        when("resolving type whose dependency resolves to undefined", function () {
            builder.forType(dependency1).call(function () { });
            var action = function () { builder.build().resolve(typeWithDependencies); };

            it("throws with resolve chain in message", function () {
                action.should.throw("Failed to resolve dependency1"
                    + " while attempting to resolve typeWithDependencies");
            });
        });

        when("resolve error occurs with multiple resolves in chain", function () {
            function one(p) { }
            function two(p) { }
            function three(four) { }
            function four(five) { }
            one.dependencies = [two];
            two.dependencies = ['three'];

            builder.create(three).forKey('three');
            builder.create(four).forParameter('four');
            builder.call(function () { }).forParameter('five');

            var action = function () { builder.build().resolve(one); };

            it("throws with each dependency in chain", function () {
                action.should.throw("Failed to resolve param: 'five'"
                    + " while attempting to resolve one -> two -> 'three' -> param: 'four'");
            });
        });

        when("registering as non-function type", function () {
            var action = function () { builder.forType({}); };

            it("throws", function () {
                action.should.throw('Registration type is not a function');
            });
        });

        when("registering as non-string key", function () {
            var action = function () { builder.forKey({}); };

            it("throws", function () {
                action.should.throw('Registration key is not a string');
            });
        });

        when("registering as non-string parameter", function () {
            var action = function () { builder.forParameter({}); };

            it("throws", function () {
                action.should.throw('Parameter name is not a string');
            });
        });

        when("configuring type registration", function () {
            var registration = builder.forType(type);

            when("creating a non-function", function () {
                var action = function () { registration.create('type'); };

                it("throws", function () {
                    action.should.throw('Type is not a function');
                });
            });

            when("creating an unnamed non-subtype", function () {
                var action = function () { registration.create(function () { }); };

                it("throws", function () {
                    action.should.throw('Anonymous type does not inherit from type');
                });
            });

            when("creating a named non-subtype", function () {
                var action = function () { registration.create(function nonSubType() { }); };

                it("throws with non-subtype name in message", function () {
                    action.should.throw('nonSubType does not inherit from type');
                });
            });

            when("using an undefined value", function () {
                var action = function () { registration.use(); };

                it("throws", function () {
                    action.should.throw('Value is undefined');
                });
            });

            when("using a value of the wrong type", function () {
                var action = function () { registration.use({}); };

                it("throws", function () {
                    action.should.throw('Value does not inherit from type');
                });
            });

            when("calling a non-function", function () {
                var action = function () { registration.call({}); };

                it("throws", function () {
                    action.should.throw('Factory is not a function');
                });
            });

            when("registering parameter with non-string name", function () {
                var action = function () { registration.withParameterNamed({}); };

                it("throws", function () {
                    action.should.throw('Parameter name is not a string');
                });
            });

            when("registering parameter with non-function type", function () {
                var action = function () { registration.withParameterTyped({}); };

                it("throws", function () {
                    action.should.throw('Parameter type is not a function');
                });
            });

            when("using parameter hook with non-function matcher", function () {
                var action = function () { registration.useParameterHook({}, function () { }); };

                it("throws", function () {
                    action.should.throw('Match callback is not a function');
                });
            });

            when("using parameter hook with non-function resolve", function () {
                var action = function () { registration.useParameterHook(function () { }, {}); };

                it("throws", function () {
                    action.should.throw('Resolve callback is not a function');
                });
            });
        });

        when("registering non-subtype for unnamed base type", function () {
            var action = function () {
                builder.create(function nonSubType() { })
                    .forType(function () { });
            };

            it("throws with default name in message", function () {
                action.should.throw('nonSubType does not inherit from anonymous base type');
            });
        });

        when("configuring typed parameter registration", function () {
            var registration = builder.forType(typeWithDependencies).withParameterTyped(dependency1);

            when("creating a non-function type", function () {
                var action = function () { registration.creating({}); };

                it("throws", function () {
                    action.should.throw('Type is not a function');
                });
            });

            when("creating a non-subtype", function () {
                var action = function () { registration.creating(function () { }); };

                it("throws", function () {
                    action.should.throw('Anonymous type does not inherit from dependency1');
                });
            });

            when("using an undefined value", function () {
                var action = function () { registration.using(); };

                it("throws", function () {
                    action.should.throw('Value is undefined');
                });
            });

            when("using value of wrong type", function () {
                var action = function () { registration.using({}); };

                it("throws", function () {
                    action.should.throw('Value does not inherit from dependency1');
                });
            });

            when("calling a non-function", function () {
                var action = function () { registration.calling({}); };

                it("throws", function () {
                    action.should.throw('Factory is not a function');
                });
            });
        });
    });
});
