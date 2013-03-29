describe("inject.js", function () {
    function type() { }
    function dependency1() { }
    function dependency2() { }
    var typeWithDependencies = Inject.ctor([dependency1, dependency2],
        function (d1, d2) {
            this.dependency1 = d1;
            this.dependency2 = d2;
        });
    var builder = new Inject.Builder();

    describe("empty container", function () {
        var sut = builder.build();

        then("attempting to register another type with builder throws error", function () {
            should.throw(function () {
                builder.register(function () { });
            }, 'Cannot register anything else once the container has been built');
        });

        when("resolving existing class", function () {
            function unregisteredClass() { };
            var result = sut.resolve(unregisteredClass);

            it("instantiates unregistered class", function () {
                result.should.be.an.instanceOf(unregisteredClass);
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
                var factory = sut.resolve(Inject.factoryFor(typeWithDependencies));

                then("calling factory instantiates type with dependencies", function () {
                    var result = factory();
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with partial parameters", function () {
                var factory = sut.resolve(Inject.factoryFor(typeWithDependencies, [dependency2]));

                when("calling factory function", function () {
                    var dependency2Instance = new dependency2();
                    var result = factory(dependency2Instance);

                    then("type constructed with passed in dependency", function() {
                        result.dependency2.should.equal(dependency2Instance);
                    });
                });
            });
        });

        then("resolving an unregistered name throws", function () {
            (function () { sut.resolve('foo'); })
                .should.throw("Nothing registered as 'foo'");
        });
    });

    describe("registration", function () {
        when("subtype is registered as super type", function () {
            function superClass() { }
            function subClass() { }
            subClass.prototype = new superClass();
            
            var registration = builder.register(subClass);
            var chain = registration.as(superClass);
            var sut = builder.build();

            it("can be chained", function() {
                chain.should.equal(registration);
            });

            when("resolving super type", function () {
                var result = sut.resolve(superClass);

                it("instantiates the sub class", function () {
                    result.should.be.an.instanceOf(subClass);
                });
            });
        });

        when("type is registered as multiple interfaces", function () {
            function expectedType() { }
            function interface1() { }
            function interface2() { }

            builder.register(expectedType).as([interface1, interface2]);
            var sut = builder.build();

            when("resolving the first interface", function () {
                var result = sut.resolve(interface1);

                it("instantiates the implementation", function () {
                    result.should.be.an.instanceOf(expectedType);
                });
            });

            when("resolving the second interface", function () {
                var result = sut.resolve(interface2);

                it("instantiates the implementation", function () {
                    result.should.be.an.instanceOf(expectedType);
                });
            });
        });

        when("object instance is registered as type", function () {
            var obj = {};
            builder.register(obj).as(type);
            var sut = builder.build();

            when("type is resolved", function () {
                var result = sut.resolve(type);

                it("resolves to the object", function () {
                    result.should.equal(obj);
                });
            });
        });

        when("type is registered as a named dependency", function () {
            builder.register(type).as('named');

            when("resolving named dependency", function () {
                var sut = builder.build();
                var result = sut.resolve('named');

                it("resolves to instance of the registered type", function () {
                    result.should.be.an.instanceOf(type);
                });
            });

            when("another type is registered with a different name", function () {
                function type2() { }

                builder.register(type2).as('different');
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

        when("type is registered with parameter registration", function () {
            var dependency1Instance = new dependency1();
            var parameterResolver = sinon.stub().returns(dependency1Instance);
            builder.register(typeWithDependencies)
                .withParameter(
                    function (p) { return p.type == dependency1; },
                    parameterResolver);
            var sut = builder.build();

            when("type is resolved", function () {
                var result = sut.resolve(typeWithDependencies);

                then("parameter resolver called with container & parameter", function () {
                    var args = parameterResolver.firstCall.args;
                    args[0].should.be.an.instanceOf(Inject.Container);
                    args[1].should.deep.equal(new Inject.Parameter(dependency1, 'd1', 0));
                });

                then("parameter is resolved to parameter factory result", function () {
                    result.dependency1.should.equal(dependency1Instance);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });
        });

        when("factory method is registered as type", function () {
            var expectedResult = new type();
            var factory = sinon.stub().returns(expectedResult);
            builder
                .registerFactory(factory)
                .as(type);
            var sut = builder.build();

            when("type is resolved", function () {
                var result = sut.resolve(type);

                then("container is passed in to factory", function () {
                    factory.firstCall.args[0].should.be.an.instanceOf(Inject.Container);
                });

                then("resolves to factory return value", function () {
                    result.should.equal(expectedResult);
                });
            });
        });

        when("factory method returns undefined", function () {
            builder.registerFactory(function () { }).as([type, 'name']);
            var sut = builder.build();

            then("resolving type throws", function () {
                should.throw(function () {
                    sut.resolve(type);
                }, 'Type resolved to undefined');
            });

            then("resolving name throws", function () {
                should.throw(function () {
                    sut.resolve('name');
                }, "'name' resolved to undefined");
            });
        });
    });

    when("sub-containers", function () {
        when("building a sub-container", function () {
            var registration = sinon.spy();
            var sut = builder.build();
            sut.buildSubContainer(registration);

            then("registration callback is called with a Builder", function() {
                registration.firstCall.args[0].should.be.an.instanceOf(Inject.Builder);
            });
        });

        when("type is registered in original container", function () {
            builder.register(type).as('foo');
            var outer = builder.build();
            var inner = outer.buildSubContainer();

            then("type can be resolved from inner container", function () {
                inner.resolve('foo').should.be.an.instanceOf(type);
            });
        });

        when("type is registered in sub-container", function () {
            var outer = builder.build();
            var inner = outer.buildSubContainer(function (innerBuilder) {
                innerBuilder.register(type).as('foo');
            });

            then("type can't be resolved from outer container", function () {
                should.throw(function () { outer.resolve('foo'); });
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
        when("no lifetime specified", function () {
            function disposableType() {
                this.dispose = this.disposeMethod = sinon.spy();
            }
            builder.register(disposableType);
            var sut = builder.build();

            when("resolved twice", function () {
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

        when("registered with single instance lifetime", function () {
            var registration = builder.register(type);
            var chain = registration.singleInstance();
            var outer = builder.build();

            it("can be chained", function() {
                chain.should.equal(registration);
            });

            when("resolved twice from same container", function () {
                var result1 = outer.resolve(type);
                var result2 = outer.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = outer.buildSubContainer();
                var result1 = outer.resolve(type);
                var result2 = inner.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });
        });

        when("registered with instance per container lifetime", function () {
            var registration = builder.register(type);
            var chain = registration.instancePerContainer();
            var outer = builder.build();

            it("can be chained", function () {
                chain.should.equal(registration);
            });

            when("resolved twice from same container", function () {
                var result1 = outer.resolve(type);
                var result2 = outer.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("resolved from outer & inner containers", function () {
                var inner = outer.buildSubContainer();
                var result1 = outer.resolve(type);
                var result2 = inner.resolve(type);

                then("two separate instances are created", function () {
                    result1.should.not.equal(result2);
                });
            });
        });
    });
});
