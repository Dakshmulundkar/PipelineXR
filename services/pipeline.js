const scanners = require('./security/scanners');

class PipelineService {
    constructor(io) {
        this.io = io;
    }

    async runPipeline() {
        this.emitStatus('PIPELINE_START', 'Starting DevSecOps Pipeline...');

        const stages = [
            { name: 'Dependency Scan', fn: scanners.runDependencyScan },
            { name: 'Secret Scan', fn: scanners.runSecretScan },
            { name: 'SAST Scan', fn: scanners.runSASTScan },
            { name: 'Container Scan', fn: scanners.runContainerScan }
        ];

        let pipelinePassed = true;
        const results = {};

        for (const stage of stages) {
            this.emitStatus('STAGE_START', `Running ${stage.name}...`, stage.name);

            try {
                const result = await stage.fn();
                results[stage.name] = result;

                this.emitStatus('STAGE_COMPLETE', `Finished ${stage.name}: ${result.status}`, stage.name, result);

                if (result.status === 'FAIL') {
                    pipelinePassed = false;
                    this.emitStatus('PIPELINE_FAIL', `Pipeline Failed at stage: ${stage.name}`);
                    break; // Stop pipeline on first failure (Fail Fast)
                }
            } catch (err) {
                console.error(`Error in stage ${stage.name}:`, err);
                pipelinePassed = false;
                this.emitStatus('STAGE_ERROR', `Internal Error in ${stage.name}`, stage.name, { error: err.message });
                this.emitStatus('PIPELINE_FAIL', `Pipeline Crashed at stage: ${stage.name}`);
                break;
            }
        }

        if (pipelinePassed) {
            this.emitStatus('PIPELINE_SUCCESS', 'All Security Checks Passed! Proceeding to Deployment.');
        }

        return { success: pipelinePassed, results };
    }

    emitStatus(type, message, stage = null, details = null) {
        if (this.io) {
            this.io.emit('pipeline_update', {
                type,
                message,
                stage,
                details,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = PipelineService;
