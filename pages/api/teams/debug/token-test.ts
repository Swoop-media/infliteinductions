// Use the correct tenant for token acquisition
    const tenant = appType === "SingleTenant" ? tenantId : "botframework.com";