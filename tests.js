describe("inject.js", function () {
    var builder = new Inject.Builder();

    when("nothing registered", function () {
        var sut = builder.build();

        then("registering another type throws", function () {
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
            function dependency1() { }
            function dependency2() { }

            var type = Inject.ctor([dependency1, dependency2],
                function (d1, d2) {
                    this.dependency1 = d1;
                    this.dependency2 = d2;
                });

            when("resolving type", function () {
                var result = sut.resolve(type);

                it("instantiates type with dependencies", function () {
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });

            when("resolving factory function with no parameters", function () {
                var factory = sut.resolve(Inject.factoryFor(type));

                then("calling factory instantiates type with dependencies", function () {
                    var result = factory();
                    result.dependency1.should.be.an.instanceOf(dependency1);
                    result.dependency2.should.be.an.instanceOf(dependency2);
                });
            });
        });

        then("resolving an unregistered name throws", function () {
            should.throw(function () {
                sut.resolve('foo');
            }, "Nothing registered as 'foo'");
        });
    });

    when("subtype is registered as super type", function () {
        function superClass() { }
        function subClass() { }
        subClass.prototype = new superClass();

        builder.register(subClass).as(superClass);
        var sut = builder.build();

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
        function type() { }
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
        function type() { }

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

    when("type is disposable", function () {
        function type() {
            this.dispose = this.disposeMethod = sinon.spy();
        }

        var sut = builder.build();

        when("type has been resolved twice", function () {
            var resolved1 = sut.resolve(type);
            var resolved2 = sut.resolve(type);

            when("container is disposed", function () {
                sut.dispose();

                then("resolved objects are disposed as well", function () {
                    resolved1.disposeMethod.should.have.been.called;
                    resolved2.disposeMethod.should.have.been.called;
                });
            });

            when("resolved object is disposed", function () {
                resolved1.dispose();

                when("container is disposed", function () {
                    sut.dispose();

                    then("disposed resolved object is not disposed again", function () {
                        resolved1.disposeMethod.should.have.been.calledOnce;
                    });
                });
            });
        });
    });

    when("building a sub-container", function () {
        then("registration callback is called with a Builder", function () {
            var registration = sinon.spy();
            var sut = builder.build();
            sut.buildSubContainer(registration);

            registration.should.have.been.called;
            registration.firstCall.args[0].should.be.an.instanceOf(Inject.Builder);
        });

        when("type is registered in original container", function () {
            function type() { }
            builder.register(type).as('foo');
            var outer = builder.build();
            var inner = outer.buildSubContainer();

            then("type can be resolved from inner container", function () {
                inner.resolve('foo').should.be.an.instanceOf(type);
            });
        });

        when("type is registered in sub-container", function () {
            function type() { }
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
        function type() { }

        when("no lifetime specified", function () {
            builder.register(type);
            var sut = builder.build();

            when("resolved twice", function () {
                var result1 = sut.resolve(type);
                var result2 = sut.resolve(type);

                then("two separate instances are created", function () {
                    result1.should.not.equal(result2);
                });
            });
        });

        when("registered with single instance lifetime", function () {
            builder.register(type).singleInstance();
            var sut = builder.build();

            when("resolved twice", function () {
                var result1 = sut.resolve(type);
                var result2 = sut.resolve(type);

                then("same instance returned both times", function () {
                    result1.should.equal(result2);
                });
            });

            when("sub-container is created", function() {
                var subSut = sut.buildSubContainer();

                when("resolved from each container", function() {
                    var result1 = sut.resolve(type);
                    var result2 = subSut.resolve(type);

                    then("same instance returned both times", function() {
                        result1.should.equal(result2);
                    });
                });
            });
        });
    });
});