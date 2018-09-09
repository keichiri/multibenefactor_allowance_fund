async function retrieveEvent (tx, eventName) {
    const { logs } = await tx;
    return getLog(logs, eventName);
}


async function getLog(logs, eventName) {
    return logs.find(e => e.event == eventName);
}


async function assertRevert(promise) {
    try {
        await promise;
        assert.fail("Expected revert not received");
    } catch (error) {
        const revertExists = error.message.search("revert") >= 0;
        assert(revertExists, `Expected "revert", got ${error} instead`);
    }
}


module.exports = {
    retrieveEvent,
    assertRevert,
};