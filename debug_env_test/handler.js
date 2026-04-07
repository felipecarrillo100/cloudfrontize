
exports.handler = async (event) => {
    return {
        status: 200,
        headers: {
            'x-aws-region': [{ key: 'X-Region', value: process.env.AWS_REGION }],
            'x-aws-env': [{ key: 'X-Env', value: process.env.AWS_EXECUTION_ENV }]
        },
        body: JSON.stringify(process.env)
    };
};
