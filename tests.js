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
    disposableType.prototype = new type();

    describe("empty container", function () {
        var sut = inject();

        when("resolving existing class", function () {
            function unregisteredClass() { }
            var result = sut(unregisteredClass);

            it("instantiates unregistered class", function () {
                result.should.be.an.instanceOf(unregisteredClass);
            });
        });

        when("resolving existing class with parameter but no specified dependencies", function () {
            function typeWithParameter(param) { this.arg = param; }
            var result = sut(typeWithParameter);

            it("resolves to instance of type with nothing passed in", function () {
                result.should.be.an.instanceOf(typeWithParameter);
                expect(result.arg).to.be.undefined;
            });
        });

        when("type has multiple dependencies", function () {
            when("resolving type", function () {
                var result = sut(typeWithDependencies);

                it("instantiates type with dependencies", function () {
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with no parameters", function () {
                var factory = sut(inject.func(typeWithDependencies));

                then("calling factory instantiates type with dependencies", function () {
                    var result = factory();
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with partial parameters", function () {
                var factory = sut(inject.func(typeWithDependencies, [dependency2]));

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
                var result = sut(inject.optional(type));

                it("resolves to null", function () {
                    expect(result).to.equal(null);
                });
            });

            when("with a default value", function () {
                var expectedValue = {};
                var result = sut(inject.optional(type, expectedValue));

                it("resolves to default value", function () {
                    result.should.equal(expectedValue);
                });
            });
        });

        when("resolving a container", function () {
            var result = sut(inject.resolve);

            then("same container instance is returned", function () {
                result.should.equal(sut);
            });
        });
    });

    describe("type registration", function () {
        when("setting up a registration for a type", function () {
            var registration = inject.forType(type);

            when("resolving type", function() {
                var sut = inject([registration]);
                var result = sut(type);

                it("instantiates the type", function() {
                    result.should.be.an.instanceOf(type);
                });
            });

            when("subtype created for type", function () {
                function subType() { }
                subType.prototype = new type();
                var chain = registration.create(subType);
                var sut = inject([registration]);

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("resolving type", function () {
                    var result = sut(type);

                    it("instantiates the sub type", function () {
                        result.should.be.an.instanceOf(subType);
                    });
                });
            });

            when("value used for type", function () {
                var value = new disposableType();
                var chain = registration.use(value);
                var sut = inject([registration]);

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("type is resolved", function () {
                    var result = sut(type);

                    it("resolves to the object", function () {
                        result.should.equal(value);
                    });

                    when("container is disposed", function () {
                        sut.dispose();

                        then("value is not disposed", function () {
                            value.disposeMethod.should.not.have.been.called;
                        });
                    });
                });
            });

            when("factory method called for type", function () {
                var expectedResult = new type();
                var factory = sinon.stub().returns(expectedResult);
                factory.dependencies = [dependency1];
                var chain = registration.call(factory);
                var sut = inject([registration]);

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("type is resolved", function () {
                    var result = sut(type);

                    then("dependencies are passed in to factory", function () {
                        factory.firstCall.args[0].should.be.an.instanceOf(dependency1);
                    });

                    then("resolves to factory return value", function () {
                        result.should.equal(expectedResult);
                    });
                });
            });

            when("resolving type optionally", function () {
                var sut = inject([registration]);
                var result = sut(inject.optional(type));

                it("instantiates the type", function () {
                    result.should.be.an.instanceOf(type);
                });
            });
        });

        when("setting up a registration for a key", function () {
            var registration = inject.forKey('named');

            when("type created for key", function () {
                registration.create(type);

                when("resolving key", function () {
                    var result = inject([registration])('named');

                    it("resolves to instance of the registered type", function () {
                        result.should.be.an.instanceOf(type);
                    });
                });

                when("resolving named dependency", function () {
                    var result = inject([registration])(inject.named(type, 'named'));

                    it("resolves to instance of the registered type", function () {
                        result.should.be.an.instanceOf(type);
                    });
                });

                when("another type is registered with a different name", function () {
                    function type2() { }
                    var reg2 = inject.forKey('different').create(type2);
                    var sut = inject([registration, reg2]);

                    when("resolving first name", function () {
                        var result = sut('named');

                        it("resolves to instance of the first type", function () {
                            result.should.be.an.instanceOf(type);
                        });
                    });

                    when("resolving the second name", function () {
                        var result = sut('different');

                        it("resolves to instance of the second type", function () {
                            result.should.be.an.instanceOf(type2);
                        });
                    });
                });
            });

            when("function resolved for key", function() {
                var expectedResult = 'baz';
                var func = sinon.stub();
                func.dependencies = [dependency1, dependency2];
                func.returns(expectedResult);
                var chain = registration.resolveFunction(func);

                it("can be chained", function() {
                    chain.should.equal(registration);
                });

                when("resolving key", function() {
                    var result = inject([registration])('named');

                    then("result is a function", function() {
                        result.should.be.a('function');
                    });

                    when("result is called", function() {
                        var resultResult = result('foo', 'bar');

                        then("function is called with dependencies and passed in arguments", function() {
                            var args = func.firstCall.args;
                            args[0].should.be.an.instanceOf(dependency1);
                            args[1].should.be.an.instanceOf(dependency2);
                            args[2].should.equal('foo');
                            args[3].should.equal('bar');
                        });

                        it("returns function return value", function() {
                            resultResult.should.equal(expectedResult);
                        });
                    });
                });
            });
        });

        when("registering a constructor", function () {
            var registration = inject.type(type);
            var sut = inject([registration]);

            isARegistration(registration);

            when("type is resolved", function () {
                var result = sut(type);

                then("type resolves to instance of type", function () {
                    result.should.be.an.instanceOf(type);
                });
            });
        });

        when("registering constructor as a singleton", function () {
            var registration = inject.single(type);
            var sut = inject([registration]);

            isARegistration(registration);

            when("resolving type twice", function () {
                var result1 = sut(type);
                var result2 = sut(type);

                then("type resolves to the same instance", function () {
                    result1.should.equal(result2);
                });
            });
        });

        when("registering a factory method", function () {
            var factory = sinon.stub();
            var registration = inject.factory(factory);

            isARegistration(registration);

            when("registration is set up for type", function () {
                var chain = registration.forType(type);
                var sut = inject([registration]);

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("factory returns instance of type & type is resolved", function () {
                    var expectedResult = new type();
                    factory.returns(expectedResult);
                    factory.dependencies = [dependency1]
                    var result = sut(type);

                    then("type resolves to factory return value", function () {
                        result.should.equal(expectedResult);
                    });

                    then("factory dependencies are passed in", function() {
                        factory.firstCall.args[0].should.be.an.instanceOf(dependency1);
                    });
                });

                when("factory returns null & type is resolved", function () {
                    factory.returns(null);
                    var result = sut(type);

                    then("type resolves to null", function () {
                        should.equal(result, null);
                    });
                });
            });
        });

        when("registering a value", function () {
            var value = {};
            var registration = inject.value(value);

            isARegistration(registration);

            when("registration is set up for key", function () {
                var chain = registration.forKey('key');
                var sut = inject([registration]);

                it("can be chained", function () {
                    chain.should.equal(registration);
                });

                when("key is resolved", function () {
                    var result = sut('key');

                    then("key resolves to value", function () {
                        result.should.equal(value);
                    });
                });
            });
        });

        when("registering a null value for a type", function () {
            var registration = inject.value(null).forType(type);

            when("type is resolved", function () {
                var result = inject([registration])(type);

                it("resolves type to null", function () {
                    should.equal(result, null);
                });
            });
        });

        when("registering a post-build function", function () {
            var callback = sinon.spy(function (o) {
                o.callbackProperty = true;
            });
            var registration = inject.type(type).then(callback);
            var sut = inject([registration]);

            when("type is resolved", function () {
                var result = sut(type);

                then("callback is called with resolved value", function () {
                    callback.should.have.been.calledWith(result);
                });
            });
        });

        when("registering a function", function() {
            var expectedResult = 'baz';
            var func = sinon.stub();
            func.dependencies = [dependency1, dependency2];
            func.returns(expectedResult);
            var registration = inject.function(func);

            isARegistration(registration);

            when("registration is set up for key", function() {
                registration.forKey('key');
                var sut = inject([registration]);

                when("key is resolved", function() {
                    var result = sut('key');

                    when("result is called", function() {
                        var resultResult = result('foo', 'bar');

                        then("function is called with dependencies and passed in arguments", function() {
                            var args = func.firstCall.args;
                            args[0].should.be.an.instanceOf(dependency1);
                            args[1].should.be.an.instanceOf(dependency2);
                            args[2].should.equal('foo');
                            args[3].should.equal('bar');
                        });

                        it("returns function return value", function() {
                            resultResult.should.equal(expectedResult);
                        });
                    });
                });
            });
        });

        function isARegistration(registration) {
            then("registration is returned", function() {
                registration.should.respondTo('build');
            });
        }
    });

    describe("parameter registration", function () {
        var typeRegistration = inject.forType(typeWithDependencies);

        when("type is registered with parameter hook", function () {
            var dependency1Instance = new dependency1();
            var parameterResolver = sinon.spy(function (r, d) {
                if (d == dependency1) return dependency1Instance;
            });
            typeRegistration.useParameterHook(parameterResolver);
            var sut = inject([typeRegistration]);

            when("type is resolved", function () {
                var result = sut(typeWithDependencies);

                then("parameter resolver called with container & parameter", function () {
                    parameterResolver.should.have.been.calledWith(sut(inject.resolve), dependency1);
                    parameterResolver.should.have.been.calledWith(sut(inject.resolve), dependency2);
                });

                then("parameter is resolved to parameter factory result", function () {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });
        });

        when("registering a typed parameter", function () {
            var dependency2Instance = new dependency2();
            var chain = typeRegistration.withDependency(dependency2, dependency2Instance);

            it("can be chained", function () {
                chain.should.equal(typeRegistration);
            });

            when("type is resolved", function () {
                var sut = inject([typeRegistration]);
                var result = sut(typeWithDependencies);

                then("type is resolved with specified value", function () {
                    result.dependency2.should.equal(dependency2Instance);
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
                var sut = inject([typeRegistration]);
                var result = sut(typeWithDependencies);

                then("type is resolved with specified values", function () {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.equal(dependency2Instance);
                });
            });
        });
    });

    describe("sub-containers", function () {
        when("type is registered in original container", function () {
            var outer = inject([inject.forKey('foo').create(type)]);
            var inner = inject([], outer);

            then("type can be resolved from inner container", function () {
                inner('foo').should.be.an.instanceOf(type);
            });
        });

        when("type is registered in sub-container", function () {
            var outer = inject();
            var inner = inject([inject.forKey('foo').create(type)], outer);

            then("type can't be resolved from outer container", function () {
                (function () { outer('foo'); })
                    .should.throw();
            });

            then("type can be resolved from inner container", function () {
                inner('foo').should.be.an.instanceOf(type);
            });
        });

        when("outer container is disposed", function () {
            var outer = inject();
            var inner = inject([], outer);
            this.spy(inner, 'dispose');

            outer.dispose();

            then("inner container is disposed", function () {
                inner.dispose.should.have.been.called;
            });
        });

        when("inner container is disposed", function () {
            var outer = inject();
            var inner = inject([], outer);
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
        when("registered as singleton in outer container", function () {
            var registration = inject.forType(disposableType);
            var chain = registration.once();
            var outer = inject([registration]);

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("resolved twice from same container", function () {
                var result1 = outer(disposableType);
                var result2 = outer(disposableType);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = inject([], outer);
                var innerResult = inner(disposableType);
                var outerResult = outer(disposableType);

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

        when("registered as singleton in inner container", function () {
            var registration = inject.type(disposableType).perDependency();
            var outer = inject([registration]);
            var inner = inject([inject.single(disposableType)], outer);

            when("resolved from outer container twice", function () {
                var result1 = outer(disposableType);
                var result2 = outer(disposableType);

                then("different instances returned", function () {
                    return result1.should.not.equal(result2);
                });
            });

            when("when resolved from inner container twice", function () {
                var result1 = inner(disposableType);
                var result2 = inner(disposableType);

                then("same instance returned both times", function () {
                    return result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var outerResult = outer(disposableType);
                var innerResult = inner(disposableType);

                then("different instances returned", function () {
                    return innerResult.should.not.equal(outerResult);
                });
            });
        });

        when("type with dependencies registered as singleton", function () {
            var outerDependency1 = new dependency1();
            var outerDependency2 = new dependency2();
            var outer = inject([
                inject.single(typeWithDependencies),
                inject.value(outerDependency1).forType(dependency1),
                inject.value(outerDependency2).forType(dependency2)
            ]);

            when("resolved from an inner container", function() {
                var inner = inject([
                    inject.value(new dependency1()).forType(dependency1),
                    inject.value(new dependency2()).forType(dependency2)
                ], outer);

                var result = inner(typeWithDependencies);

                then("dependencies are resolved from outer container", function() {
                    result.dependency1.should.equal(outerDependency1);
                    result.dependency2.should.equal(outerDependency2);
                });
            });
        });

        when("registered with instance per container lifetime", function () {
            var registration = inject.forType(disposableType);
            var chain = registration.perContainer();
            var outer = inject([registration]);

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("resolved twice from same container", function () {
                var result1 = outer(disposableType);
                var result2 = outer(disposableType);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = inject([], outer);
                var result1 = outer(disposableType);
                var result2 = inner(disposableType);

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
            var registration = inject.forType(disposableType);
            var chain = registration.perDependency();

            var sut = inject([registration]);

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("type is resolved twice", function () {
                var result1 = sut(disposableType);
                var result2 = sut(disposableType);

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

        when("factory function resolved", function() {
            var funcDef = inject.func(disposableType);
            var sut = inject();
            var func = sut(funcDef);

            when("factory function called twice", function() {
                var result1 = func();
                var result2 = func();

                it("returns separate instances", function() {
                    result1.should.not.equal(result2);
                });

                when("container disposed", function() {
                    sut.dispose();

                    then("both instances are disposed", function() {
                        result1.disposeMethod.should.have.been.called;
                        result2.disposeMethod.should.have.been.called;
                    });
                });
            });
        });
    });

    describe("errors", function () {
        when("container built with nothing registered", function () {
            var sut = inject();

            when("resolving an unregistered name", function () {
                var action = (function () { sut('foo'); });

                it("throws with name in message", function () {
                    action.should.throw("Failed to resolve key 'foo'");
                });
            });

            when("resolving type with an unregistered named dependency", function () {
                function typeWithNamedDependency(d1) { }
                typeWithNamedDependency.dependencies = ['unregistered'];
                var action = function () { sut(typeWithNamedDependency); };

                it("throws with resolve chain in message", function () {
                    action.should.throw("Failed to resolve key 'unregistered'"
                        + " while attempting to resolve typeWithNamedDependency");
                });
            });

            when("resolving null", function () {
                var action = function () { sut(null); };

                it("throws with null in message", function () {
                    action.should.throw("Tried to resolve 'null'");
                });
            });

            then("resolving undefined", function () {
                var action = function () { sut(); };

                it("throws with undefined in message", function () {
                    action.should.throw("Tried to resolve 'undefined'");
                });
            });
        });

        when("resolving to undefined", function () {
            var sut = inject([inject.forType(type).call(function () { })]);
            var action = function () { sut(type); };

            it("throws with undefined in message", function () {
                action.should.throw("type resolved to undefined");
            });
        });

        when("resolving to wrong type", function () {
            var sut = inject([inject.forType(type).call(function () { return {}; })]);
            var action = function () { sut(type); };

            it("throws", function () {
                action.should.throw('Value does not inherit from type');
            });
        });

        when("resolving named dependency to wrong type", function () {
            var sut = inject([inject.forKey('foo').use({})]);
            var action = function () { sut(inject.named(type, 'foo')); };

            it("throws", function () {
                action.should.throw('Value does not inherit from type');
            });
        });

        when("resolving type whose dependency resolves to undefined", function () {
            var sut = inject([
                inject.forType(dependency1).call(function () { })
            ]);
            var action = function () { sut(typeWithDependencies); };

            it("throws with resolve chain in message", function () {
                action.should.throw("dependency1 resolved to undefined"
                    + " while attempting to resolve typeWithDependencies");
            });
        });

        when("resolve error occurs with multiple resolves in chain", function () {
            function one(p) { }
            function two(p) { }
            function three(four) { }
            one.dependencies = [two];
            two.dependencies = ['three'];
            three.dependencies = ['four'];

            var sut = inject([
                inject.type(three).forKey('three'),
                inject.factory(function () { }).forKey('four')
            ]);

            var action = function () { sut(one); };

            it("throws with each dependency in chain", function () {
                action.should.throw("'four' resolved to undefined"
                    + " while attempting to resolve one -> two -> 'three'");
            });
        });

        when("registering as non-function type", function () {
            var action = function () { inject.forType({}); };

            it("throws", function () {
                action.should.throw('Registration type is not a function');
            });
        });

        when("registering as non-string key", function () {
            var action = function () { inject.forKey({}); };

            it("throws", function () {
                action.should.throw('Registration key is not a string');
            });
        });

        when("configuring type registration", function () {
            var registration = inject.forType(type);

            when("creating a non-function", function () {
                var action = function () { registration.create('type'); };

                it("throws", function () {
                    action.should.throw('Constructor is not a function');
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

            when("resolving to a function", function() {
                var action = function () { registration.resolveFunction(function () { }) };

                it("throws", function() {
                    action.should.throw("A type cannot be resolved to a function");
                });
            });

            when("using parameter hook with non-function", function () {
                var action = function () { registration.useParameterHook({}); };

                it("throws", function () {
                    action.should.throw('Parameter hook is not a function');
                });
            });
        });

        when("configuring a value registration", function() {
            var registration = inject.value({});

            when("registering for non-base type", function() {
                var action = function () { registration.forType(function nonBaseType() { }); };

                it("throws", function() {
                    action.should.throw("Value does not inherit from nonBaseType");
                });
            });

            when("registering for non-string key", function() {
                var action = function () { registration.forKey({}); };

                it("throws", function() {
                    action.should.throw("Registration key is not a string");
                });
            });
        });

        when("configuring function registration", function() {
            var registration = inject.function(function () { });

            when("registering for type", function() {
                var action = function () { registration.forType(type); };

                it("throws", function() {
                    action.should.throw("A type cannot be resolved to a function");
                });
            });
        });

        when("configuring constructor registration", function() {
            var registration = inject.type(function nonSubType() { });

            when("registering for non-base type", function() {
                var action = function () { registration.forType(function () { }); };

                it("throws", function() {
                    action.should.throw("nonSubType does not inherit from anonymous base type");
                });
            });
        });

        when("registering a typed parameter with wrong type", function() {
            var registration = inject.forKey('foo');
            var action = function () { registration.withDependency(type, {}); };

            it("throws", function() {
                action.should.throw("Value does not inherit from type");
            });
        });

        when("injecting a registration with no factory", function() {
            var registration = inject.forKey('foo');
            var action = function () { inject([registration]); };

            it("throws", function() {
                action.should.throw("No factory defined for 'foo' registration");
            });
        });

        when("injecting a registration with no key", function() {
            var registration = inject.value({});
            var action = function () { inject([registration]); };

            it("throws", function() {
                action.should.throw("No key defined for registration");
            });
        });

        when("specifying undefined dependency for named function", function () {
            var action = specifyUndefinedDependency(function UndefinedDependencyType(u) { });

            it("throws", function () {
                action.should.throw('UndefinedDependencyType has an undefined dependency');
            });
        });

        when("specifying undefined dependency for unnamed function", function () {
            var action = specifyUndefinedDependency(function (u) { });

            it("throws", function () {
                action.should.throw('Type has an undefined dependency');
            });
        });

        function specifyUndefinedDependency(constructor) {
            return function () { inject.ctor([undefined], constructor); };
        }

        when("specifying wrong number of dependencies", function () {
            it("throws", function () {
                (function () {
                    inject.ctor(['foo', 'bar'], function (baz) { });
                }).should.throw("Type has 2 dependencies, but 1 parameter");

                (function () {
                    inject.ctor(['foo'], function () { });
                }).should.throw("Type has 1 dependency, but 0 parameters")
            });
        });
    });
});
