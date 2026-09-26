/**
 * Mocked Queue interface for backward compatibility.
 */

export const QUEUE_NAME = 'video-summarization';

export function getSummarizationQueue() {
    return {
        add: async (name, data, opts) => ({ id: opts?.jobId || 'job_mock' }),
        getJob: async () => null,
    };
}